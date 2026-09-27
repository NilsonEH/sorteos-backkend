const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { PLANS, charge } = require('../culqi');

const MAX_FAILED = 3;
let running = false;

// Cobra a todos los suscriptores activos cuya fecha de cobro ya llegó
router.post('/run', async (req, res) => {
  if (running) return res.status(409).json({ error: 'Ya hay un proceso de cobro en curso' });
  running = true;
  const summary = { charged: 0, failed: 0, suspended: 0 };

  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscribers
       WHERE status = 'active' AND culqi_card_id IS NOT NULL AND next_billing_at <= NOW()`
    );

    for (const s of rows) {
      const p = PLANS[s.plan];
      if (!p) continue;
      try {
        await charge({
          amount: p.amount,
          email: s.email,
          cardId: s.culqi_card_id,
          description: `Renovación ${s.plan} - Sorteos`,
          recurrent: true
        });
        await pool.query(
          `UPDATE subscribers
           SET next_billing_at = GREATEST(next_billing_at + make_interval(months => $1), NOW() + INTERVAL '1 day'),
               failed_attempts = 0
           WHERE id = $2`,
          [p.months, s.id]
        );
        summary.charged++;
        console.log(`Cobro exitoso: ${s.email}`);
      } catch (err) {
        const attempts = s.failed_attempts + 1;
        const suspend = attempts >= MAX_FAILED;
        await pool.query(
          `UPDATE subscribers SET failed_attempts = $1, status = $2 WHERE id = $3`,
          [attempts, suspend ? 'past_due' : 'active', s.id]
        );
        summary.failed++;
        if (suspend) summary.suspended++;
        console.log(`Cobro fallido (${attempts}/${MAX_FAILED}): ${s.email} - ${err.message}`);
      }
    }

    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al ejecutar los cobros' });
  } finally {
    running = false;
  }
});

module.exports = router;
