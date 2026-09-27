const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendPurchaseEmail } = require('../mailer');
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
    return res.status(400).json({
      error: `El máximo por pago es S/ ${(MAX_AMOUNT / 100).toFixed(2)}. Puedes hacer otra compra después.`
    });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const fullName = `${firstName} ${lastName}`.trim();

  // 1) Cobrar con Culqi
  let payment;
  try {
    payment = await charge({
      amount,
      email: cleanEmail,
      cardId: culqiToken,
      description: `${qty} boletos - Sorteo semanal`
    });
  } catch (err) {
    console.error('Error en cobro:', err.message, err.culqi || '');
    if (err.culqi) return res.status(402).json({ error: err.message });
    return res.status(500).json({ error: 'Error al procesar el pago' });
  }

  // 2) Registrar la compra. Si falla, el pago YA se hizo: dejar rastro claro.
  try {
    await pool.query(
      `INSERT INTO purchases (name, email, phone, quantity, amount, charge_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fullName, cleanEmail, phone, qty, amount, payment.id]
    );
  } catch (dbErr) {
    console.error('PAGO COBRADO SIN REGISTRAR:', JSON.stringify({
      chargeId: payment.id, name: fullName, email: cleanEmail, phone, qty, amount,
      error: dbErr.message
    }));
    return res.status(500).json({
      error: 'Tu pago se realizó, pero hubo un problema al registrar tus boletos. Guarda este código y contáctanos para solucionarlo.',
      chargeId: payment.id
    });
  }

  // 3) Total de boletos de esta persona en el sorteo actual
  let totalThisRound = qty;
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM purchases WHERE email = $1 AND raffle_id IS NULL`,
      [cleanEmail]
    );
    totalThisRound = rows[0].total;
  } catch (e) {
    console.error('No se pudo calcular el total:', e.message);
  }
// 4) Confirmación por correo (no retrasa la respuesta al comprador)
  sendPurchaseEmail({ email: cleanEmail, name: firstName, quantity: qty, amount, totalThisRound, chargeId: payment.id })
    .catch(e => console.error('Correo de compra:', e.message));
  console.log(`Compra: ${cleanEmail} - ${qty} boletos (S/ ${(amount / 100).toFixed(2)})`);
  res.status(201).json({ ok: true, chargeId: payment.id, quantity: qty, totalThisRound });
});

router.post('/webhook', express.json(), async (req, res) => {
  console.log('Evento de Culqi recibido:', req.body?.type);
  res.sendStatus(200);
});

module.exports = router;
