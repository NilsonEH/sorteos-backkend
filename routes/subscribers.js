const express = require('express');
const router = express.Router();
const db = require('../db');

const TICKETS_BY_PLAN = { mensual: 1, anual: 3 };

// Listar suscriptores activos (para el panel de sorteos)
router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at DESC`).all();
  res.json(rows);
});

// Crear un suscriptor manualmente (uso interno / pruebas).
// En producción esto lo dispara el webhook de pagos, no el frontend directamente.
router.post('/', (req, res) => {
  const { name, email, plan } = req.body;
  if (!name || !email || !plan) {
    return res.status(400).json({ error: 'Faltan campos: name, email, plan' });
  }
  const tickets = TICKETS_BY_PLAN[plan] || 1;
  try {
    const stmt = db.prepare(
      `INSERT INTO subscribers (name, email, plan, tickets) VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(name, email, plan, tickets);
    res.status(201).json({ id: info.lastInsertRowid, name, email, plan, tickets });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Ese correo ya está suscrito' });
    }
    res.status(500).json({ error: 'Error al crear suscriptor' });
  }
});

// Cancelar suscripción (baja del sorteo)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE subscribers SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const db = require('../db');

// Historial de sorteos
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT raffles.id, raffles.prize, raffles.drawn_at,
           subscribers.name AS winner_name
    FROM raffles
    LEFT JOIN subscribers ON subscribers.id = raffles.winner_subscriber_id
    ORDER BY raffles.created_at DESC
  `).all();
  res.json(rows);
});

// Crear y sortear un premio entre los suscriptores activos.
// Cada suscriptor entra al sorteo tantas veces como "tickets" tenga su plan,
// para que el plan anual tenga más chances, igual que anunciamos en la landing.
router.post('/draw', (req, res) => {
  const { prize } = req.body;
  if (!prize) return res.status(400).json({ error: 'Falta el campo prize' });

  const subs = db.prepare(`SELECT * FROM subscribers WHERE status = 'active'`).all();
  if (subs.length === 0) {
    return res.status(400).json({ error: 'No hay suscriptores activos para sortear' });
  }

  // Arma el "bombo" repitiendo cada suscriptor según sus tickets
  const pool = [];
  subs.forEach(s => { for (let i = 0; i < s.tickets; i++) pool.push(s); });

  const winner = pool[Math.floor(Math.random() * pool.length)];

  const info = db.prepare(
    `INSERT INTO raffles (prize, winner_subscriber_id, drawn_at) VALUES (?, ?, datetime('now'))`
  ).run(prize, winner.id);

  res.status(201).json({
    raffleId: info.lastInsertRowid,
    prize,
    winner: { id: winner.id, name: winner.name, email: winner.email, plan: winner.plan }
  });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const db = require('../db');

const TICKETS_BY_PLAN = { mensual: 1, anual: 3 };

// 1) El frontend (landing) llama aquí con los datos del formulario y el
//    "token" que genera el checkout de Culqi en el navegador del usuario.
//    Aquí se crea el cargo real contra la tarjeta usando la llave secreta.
router.post('/checkout', async (req, res) => {
  const { name, email, plan, culqiToken } = req.body;
  if (!name || !email || !plan || !culqiToken) {
    return res.status(400).json({ error: 'Faltan datos del formulario o el token de pago' });
  }

  const amountByPlan = { mensual: 1900, anual: 17900 }; // en céntimos (S/ 19.00 / S/ 179.00)
  const amount = amountByPlan[plan];
  if (!amount) return res.status(400).json({ error: 'Plan inválido' });

  try {
    const response = await fetch('https://api.culqi.com/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CULQI_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount,
        currency_code: 'PEN',
        email,
        source_id: culqiToken,
        description: `Suscripción ${plan} - Sorteos`
      })
    });
    const charge = await response.json();

    if (!response.ok) {
      return res.status(402).json({ error: 'Pago rechazado', detail: charge });
    }

    const tickets = TICKETS_BY_PLAN[plan] || 1;
    const existing = db.prepare(`SELECT id FROM subscribers WHERE email = ?`).get(email);
    if (existing) {
      db.prepare(`UPDATE subscribers SET status = 'active', plan = ?, tickets = ? WHERE email = ?`)
        .run(plan, tickets, email);
    } else {
      db.prepare(`INSERT INTO subscribers (name, email, plan, tickets) VALUES (?, ?, ?, ?)`)
        .run(name, email, plan, tickets);
    }

    res.status(201).json({ ok: true, chargeId: charge.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

// 2) Webhook: Culqi también puede avisar directamente aquí sobre eventos
//    (cargos, reembolsos, suscripciones canceladas). Configura esta URL
//    en tu panel de Culqi. Verifica la firma antes de confiar en el body.
router.post('/webhook', express.json(), (req, res) => {
  const event = req.body;
  console.log('Evento de Culqi recibido:', event?.type);

  if (event?.type === 'charge.refunded' && event?.data?.email) {
    db.prepare(`UPDATE subscribers SET status = 'cancelled' WHERE email = ?`).run(event.data.email);
  }

  res.sendStatus(200);
});

module.exports = router;
