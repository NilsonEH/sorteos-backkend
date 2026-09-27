const express = require('express');
const router = express.Router();
const db = require('../db');

const TICKETS_BY_PLAN = { mensual: 1, anual: 3 };

// Listar suscriptores activos (para el panel de sorteos)
router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at DESC`).all();
  res.json(rows);
});

// Crear un suscriptor manualmente (uso interno / pruebas).
// En producción esto lo dispara el webhook de pagos, no el frontend directamente.
router.post('/', (req, res) => {
  const { name, email, plan } = req.body;
  if (!name || !email || !plan) {
    return res.status(400).json({ error: 'Faltan campos: name, email, plan' });
  }
  const tickets = TICKETS_BY_PLAN[plan] || 1;
  try {
    const stmt = db.prepare(
      `INSERT INTO subscribers (name, email, plan, tickets) VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(name, email, plan, tickets);
    res.status(201).json({ id: info.lastInsertRowid, name, email, plan, tickets });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Ese correo ya está suscrito' });
    }
    res.status(500).json({ error: 'Error al crear suscriptor' });
  }
});

// Cancelar suscripción (baja del sorteo)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE subscribers SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
