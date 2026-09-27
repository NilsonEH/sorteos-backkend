const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const TICKETS_BY_PLAN = { mensual: 1, anual: 3 };
const MONTHS_BY_PLAN = { mensual: 1, anual: 12 };

// Suscriptores vigentes (pagaron y no han vencido)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscribers
       WHERE status = 'active' AND next_billing_at > NOW()
       ORDER BY next_billing_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar suscriptores' });
  }
});

// Suscriptores vencidos (para recordarles que renueven)
router.get('/expired', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscribers
       WHERE status = 'active' AND (next_billing_at IS NULL OR next_billing_at <= NOW())
       ORDER BY next_billing_at DESC NULLS LAST`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar vencidos' });
  }
});

// Alta manual (por ejemplo, si alguien te pagó por fuera)
router.post('/', async (req, res) => {
  const { name, email, plan } = req.body;
  if (!name || !email || !TICKETS_BY_PLAN[plan]) {
    return res.status(400).json({ error: 'Faltan campos: name, email, plan' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO subscribers (name, email, plan, tickets, next_billing_at)
       VALUES ($1, $2, $3, $4, NOW() + make_interval(months => $5)) RETURNING id`,
      [name, String(email).trim().toLowerCase(), plan, TICKETS_BY_PLAN[plan], MONTHS_BY_PLAN[plan]]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese correo ya está suscrito' });
    console.error(err);
    res.status(500).json({ error: 'Error al crear suscriptor' });
  }
});

// Dar de baja
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE subscribers SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al dar de baja' });
  }
});

module.exports = router;
