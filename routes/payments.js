const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { PLANS, findOrCreateCustomer, saveCard, charge } = require('../culqi');

router.post('/checkout', async (req, res) => {
  const { firstName, lastName, email, phone, plan, culqiToken } = req.body;
  if (!firstName || !lastName || !email || !phone || !culqiToken) {
    return res.status(400).json({ error: 'Faltan datos del formulario o el token de pago' });
  }
  const p = PLANS[plan];
  if (!p) return res.status(400).json({ error: 'Plan inválido' });

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const { rows } = await pool.query(`SELECT * FROM subscribers WHERE email = $1`, [cleanEmail]);
    const existing = rows[0];

    if (existing && existing.status === 'active' && existing.culqi_card_id) {
      return res.status(409).json({ error: 'Ya tienes una suscripción activa con este correo' });
    }

    const customerId = (existing && existing.culqi_customer_id)
      || await findOrCreateCustomer({ firstName, lastName, email: cleanEmail, phone });
    const cardId = await saveCard(customerId, culqiToken);
    const firstCharge = await charge({
      amount: p.amount,
      email: cleanEmail,
      cardId,
      description: `Suscripción ${plan} - Sorteos`
    });

    await pool.query(
      `INSERT INTO subscribers
         (name, email, plan, tickets, phone, culqi_customer_id, culqi_card_id, next_billing_at, failed_attempts, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + make_interval(months => $8), 0, 'active')
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, plan = EXCLUDED.plan, tickets = EXCLUDED.tickets,
         phone = EXCLUDED.phone, culqi_customer_id = EXCLUDED.culqi_customer_id,
         culqi_card_id = EXCLUDED.culqi_card_id, next_billing_at = EXCLUDED.next_billing_at,
         failed_attempts = 0, status = 'active'`,
      [`${firstName} ${lastName}`.trim(), cleanEmail, plan, p.tickets, phone, customerId, cardId, p.months]
    );

    console.log(`Suscriptor guardado: ${cleanEmail} (${plan})`);
    res.status(201).json({ ok: true, chargeId: firstCharge.id });
  } catch (err) {
    console.error('Error en checkout:', err.message, err.culqi || '');
    if (err.culqi) return res.status(402).json({ error: err.message });
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

router.post('/webhook', express.json(), async (req, res) => {
  const event = req.body;
  console.log('Evento de Culqi recibido:', event?.type);
  res.sendStatus(200);
});

module.exports = router;
