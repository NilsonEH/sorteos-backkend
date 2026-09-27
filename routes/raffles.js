const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db');

// Historial de sorteos (público)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.prize, r.drawn_at, r.total_tickets, r.participants,
             COALESCE(r.winner_name, s.name) AS winner_name
      FROM raffles r
      LEFT JOIN subscribers s ON s.id = r.winner_subscriber_id
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar sorteos' });
  }
});

// Sortear entre todos los boletos vendidos desde el último sorteo
router.post('/draw', async (req, res) => {
  const { prize } = req.body;
  if (!prize) return res.status(400).json({ error: 'Falta el campo prize' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bloquea las compras de esta ronda para que nadie entre a medio sorteo
    const locked = await client.query(
      `SELECT id FROM purchases WHERE raffle_id IS NULL FOR UPDATE`
    );
    const ids = locked.rows.map(r => r.id);
    if (ids.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay boletos vendidos para este sorteo' });
    }

    // Boletos por participante
    const { rows: people } = await client.query(
      `SELECT email, MAX(name) AS name, MAX(phone) AS phone, SUM(quantity)::int AS tickets
       FROM purchases WHERE id = ANY($1)
       GROUP BY email`,
      [ids]
    );

    // Cada boleto es una oportunidad: sorteo ponderado y seguro
    const total = people.reduce((t, p) => t + p.tickets, 0);
    let pick = crypto.randomInt(total);
    let winner = people[0];
    for (const p of people) {
      if (pick < p.tickets) { winner = p; break; }
      pick -= p.tickets;
    }

    const { rows } = await client.query(
      `INSERT INTO raffles (prize, drawn_at, winner_name, winner_email, winner_phone, total_tickets, participants)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6) RETURNING id`,
      [prize, winner.name, winner.email, winner.phone, total, people.length]
    );
    const raffleId = rows[0].id;

    // Cierra la ronda: estos boletos ya se usaron
    await client.query(`UPDATE purchases SET raffle_id = $1 WHERE id = ANY($2)`, [raffleId, ids]);
    await client.query('COMMIT');

    res.status(201).json({
      raffleId,
      prize,
      totalTickets: total,
      participants: people.length,
      winner: { name: winner.name, email: winner.email, phone: winner.phone, tickets: winner.tickets }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error al realizar el sorteo' });
  } finally {
    client.release();
  }
});

module.exports = router;
