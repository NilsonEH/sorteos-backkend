const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Participantes del próximo sorteo, con sus boletos acumulados
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT email, MAX(name) AS name, MAX(phone) AS phone,
             SUM(quantity)::int AS tickets, SUM(amount)::int AS amount,
             COUNT(*)::int AS purchases, MAX(created_at) AS last_purchase
      FROM purchases
      WHERE raffle_id IS NULL
      GROUP BY email
      ORDER BY tickets DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar participantes' });
  }
});

module.exports = router;
