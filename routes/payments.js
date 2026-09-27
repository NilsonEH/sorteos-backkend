const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { TIERS, MIN_TICKETS, MAX_AMOUNT, priceFor, charge } = require('../culqi');

// Precios públicos para que la landing los muestre
router.get('/pricing', (req, res) => {
  res.json({ tiers: TIERS, minTickets: MIN_TICKETS, maxAmount: MAX_AMOUNT });
});

router.post('/checkout', async (req, res) => {
  const { firstName, lastName, email, phone, quantity, culqiToken } = req.body;
  if (!firstName || !lastName || !email || !phone || !culqiToken) {
    return res.status(400).json({ error: 'Faltan datos del formulario o el pago' });
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < MIN_TICKETS) {
    return res.status(400).json({ error: `La compra mínima es de ${MIN_TICKETS} boletos` });
  }
  const amount = priceFor(qty); // el precio siempre se calcula aquí, nunca en la landing
  if (amount > MAX_AMOUNT) {
    return res.status(400).json({ error: 'El máximo por pago es S/ 2000. Puedes hacer otra compra después.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const payment = await charge({
      amount,
      email: cleanEmail,
      cardId: culqiToken,
      description: `${qty} boletos - Sorteo semanal`
    });

    await pool.query(
      `INSERT INTO purchases (name, email, phone, quantity, amount, charge_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`${firstName} ${lastName}`.trim(), cleanEmail, phone, qty, amount, payment.id]
    );

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM purchases WHERE email = $1 AND raffle_id IS NULL`,
      [cleanEmail]
    );

    console.log(`Compra: ${cleanEmail} - ${qty} boletos (S/ ${(amount / 100).toFixed(2)})`);
    res.status(201).json({ ok: true, chargeId: payment.id, quantity: qty, totalThisRound: rows[0].total });
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
