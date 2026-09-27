const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT raffles.id, raffles.prize, raffles.drawn_at,
             subscribers.name AS winner_name
      FROM raffles
      LEFT JOIN subscribers ON subscribers.id = raffles.winner_subscriber_id
      ORDER BY raffles.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar sorteos' });
  }
});

router.post('/draw', async (req, res) => {
  const { prize } = req.body;
  if (!prize) return res.status(400).json({ error: 'Falta el campo prize' });

  try {
    const { rows: subs } = await pool.query(
      `SELECT * FROM subscribers WHERE status = 'active'`
    );
    if (subs.length === 0) {
      return res.status(400).json({ error: 'No hay suscriptores activos para sortear' });
    }

    const entries = [];
    subs.forEach(s => { for (let i = 0; i < s.tickets; i++) entries.push(s); });

    const winner = entries[crypto.randomInt(entries.length)];

    const { rows } = await pool.query(
      `INSERT INTO raffles (prize, winner_subscriber_id, drawn_at)
       VALUES ($1, $2, NOW()) RETURNING id`,
      [prize, winner.id]
    );

    res.status(201).json({
      raffleId: rows[0].id,
      prize,
      winner: { id: winner.id, name: winner.name, email: winner.email, plan: winner.plan }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al realizar el sorteo' });
  }
});

module.exports = router;
