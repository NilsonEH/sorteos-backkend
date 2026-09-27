const express = require('express');
const router = express.Router();
const db = require('../db');

const TICKETS_BY_PLAN = { mensual: 1, anual: 3 };

router.post('/checkout', async (req, res) => {
  const { name, email, plan, culqiToken } = req.body;
  if (!name || !email || !plan || !culqiToken) {
    return res.status(400).json({ error: 'Faltan datos del formulario o el token de pago' });
  }

  const amountByPlan = { mensual: 1900, anual: 17900 };
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

router.post('/webhook', express.json(), (req, res) => {
  const event = req.body;
  console.log('Evento de Culqi recibido:', event?.type);

  if (event?.type === 'charge.refunded' && event?.data?.email) {
    db.prepare(`UPDATE subscribers SET status = 'cancelled' WHERE email = ?`).run(event.data.email);
  }

  res.sendStatus(200);
});

module.exports = router;
