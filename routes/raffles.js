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
router.post('/draw', (req, res) => {
  const { prize } = req.body;
  if (!prize) return res.status(400).json({ error: 'Falta el campo prize' });

  const subs = db.prepare(`SELECT * FROM subscribers WHERE status = 'active'`).all();
  if (subs.length === 0) {
    return res.status(400).json({ error: 'No hay suscriptores activos para sortear' });
  }

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
