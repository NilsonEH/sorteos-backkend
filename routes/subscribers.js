const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const TICKETS_BY_PLAN = { mensual: 1, anual: 3 };

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar suscriptores' });
  }
});

router.post('/', async (req, res) => {
  const { name, email, plan } = req.body;
  if (!name || !email || !plan) {
    return res.status(400).json({ error: 'Faltan campos: name, email, plan' });
  }
  const tickets = TICKETS_BY_PLAN[plan] || 1;
  try {
    const { rows } = await pool.query(
      `INSERT INTO subscribers (name, email, plan, tickets)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, email, plan, tickets]
    );
    res.status(201).json({ id: rows[0].id, name, email, plan, tickets });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese correo ya está suscrito' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al crear suscriptor' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      `UPDATE subscribers SET status = 'cancelled' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cancelar suscripción' });
  }
});

module.exports = router;
