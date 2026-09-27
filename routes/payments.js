const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { PLANS, charge } = require('../culqi');

router.post('/checkout', async (req, res) => {
  const { firstName, lastName, email, phone, plan, culqiToken } = req.body;
  if (!firstName || !lastName || !email || !phone || !culqiToken) {
    return res.status(400).json({ error: 'Faltan datos del formulario o el pago' });
  }
  const p = PLANS[plan];
  if (!p) return res.status(400).json({ error: 'Plan inválido' });

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    // Cobro único con el token de Yape
    const payment = await charge({
      amount: p.amount,
      email: cleanEmail,
      cardId: culqiToken,
      description: `Suscripción ${plan} - Sorteos`
    });

    // next_billing_at = fecha en que vence su participación.
    // Si renueva antes de vencer, se suma al tiempo que le quedaba.
    const { rows } = await pool.query(
      `INSERT INTO subscribers (name, email, plan, tickets, phone, next_billing_at, failed_attempts, status)
       VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(months => $6), 0, 'active')
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, plan = EXCLUDED.plan, tickets = EXCLUDED.tickets, phone = EXCLUDED.phone,
         next_billing_at = GREATEST(COALESCE(subscribers.next_billing_at, NOW()), NOW()) + make_interval(months => $6),
         status = 'active'
       RETURNING next_billing_at`,
      [`${firstName} ${lastName}`.trim(), cleanEmail, plan, p.tickets, phone, p.months]
    );

    console.log(`Pago Yape recibido: ${cleanEmail} (${plan})`);
    res.status(201).json({ ok: true, chargeId: payment.id, activeUntil: rows[0].next_billing_at });
  } catch (err) {
    console.error('Error en checkout:', err.message, err.culqi || '');
    if (err.culqi) return res.status(402).json({ error: err.message });
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

router.post('/webhook', express.json(), async (req, res) => {
  console.log('Evento de Culqi recibido:', req.body?.type);
  res.sendStatus(200);
});

module.exports = router;
