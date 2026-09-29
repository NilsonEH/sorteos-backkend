// Sorteos gratis: inscripción única, premios y sorteo en vivo
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db');
const { sendEntryEmail, sendFreeWinnerEmail } = require('../mailer');

// Fecha de hoy en Lima (AAAA-MM-DD). Cada fecha con sorteos cuenta como una transmisión.
const limaToday = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Muestra "Nilson E." en lugar del nombre completo
function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

// Edad cumplida hoy (hora de Lima) a partir de AAAA-MM-DD; null si la fecha no es válida
function ageFrom(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
  const t = new Date(Date.now() - 5 * 60 * 60 * 1000);
  let age = t.getUTCFullYear() - y;
  if (t.getUTCMonth() + 1 < mo || (t.getUTCMonth() + 1 === mo && t.getUTCDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

// Límite simple: máximo 10 inscripciones por hora desde la misma conexión (evita bots)
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter(t => now - t < 60 * 60 * 1000);
  if (list.length >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera un rato e intenta de nuevo.' });
  list.push(now);
  hits.set(req.ip, list);
  if (hits.size > 5000) hits.clear();
  next();
}

// ---------- Público ----------

// Inscripción gratuita (una sola vez por correo y por celular)
router.post('/entries', rateLimit, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true }); // trampa para bots: campo oculto

  const firstName = String(b.firstName || '').trim();
  const lastName = String(b.lastName || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').replace(/\D/g, '');
  const handle = v => String(v || '').trim().replace(/^@+/, '').slice(0, 30);
  const instagram = handle(b.instagram);
  const tiktok = handle(b.tiktok);

  if (firstName.length < 2 || lastName.length < 2) return res.status(400).json({ error: 'Escribe tu nombre y apellido.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Revisa tu correo, parece incompleto.' });
  if (!/^9\d{8}$/.test(phone)) return res.status(400).json({ error: 'Escribe tu celular de 9 dígitos, empezando con 9.' });
  const validHandle = v => /^[a-zA-Z0-9._]{1,30}$/.test(v);
  if (!instagram && !tiktok) return res.status(400).json({ error: 'Escribe tu usuario de TikTok o de Instagram (al menos uno).' });
  if (tiktok && !validHandle(tiktok)) return res.status(400).json({ error: 'Revisa tu usuario de TikTok, sin espacios.' });
  if (instagram && !validHandle(instagram)) return res.status(400).json({ error: 'Revisa tu usuario de Instagram, sin espacios.' });
  const age = ageFrom(b.birthDate);
  if (age === null) return res.status(400).json({ error: 'Revisa tu fecha de nacimiento.' });
  if (age < 18) return res.status(400).json({ error: 'Lo sentimos, solo pueden participar mayores de 18 años.' });
  if (b.adult !== true) return res.status(400).json({ error: 'Debes confirmar que tus datos son reales y que vives en la región Cusco.' });
  if (b.consent !== true) return res.status(400).json({ error: 'Debes aceptar las bases y el uso de tus datos para participar.' });

  const name = `${firstName.slice(0, 60)} ${lastName.slice(0, 60)}`;
  try {
    await pool.query(
      'INSERT INTO entries (name, email, phone, instagram, tiktok, birth_date) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, email, phone, instagram || null, tiktok || null, b.birthDate]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya estás inscrito con este correo o celular. No necesitas hacer nada más: participas en todos los sorteos.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'No pudimos guardar tu inscripción. Intenta de nuevo en unos minutos.' });
  }
  sendEntryEmail({ email, name: firstName }).catch(() => {});
  res.status(201).json({ ok: true });
});

// Premios por sortear y últimos ganadores (sin datos privados)
router.get('/prizes', async (req, res) => {
  try {
    const prizes = await pool.query(
      `SELECT id, name, image_url FROM prizes WHERE status = 'pending' ORDER BY position, id`
    );
    const winners = await pool.query(
      `SELECT prize, winner_name, drawn_at FROM raffles
       WHERE kind = 'free' ORDER BY drawn_at DESC LIMIT 10`
    );
    res.json({
      prizes: prizes.rows,
      winners: winners.rows.map(w => ({ prize: w.prize, name: shortName(w.winner_name), drawnAt: w.drawn_at }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar los premios' });
  }
});

// ---------- Administrador (server.js exige la clave antes de llegar aquí) ----------

router.get('/admin/summary', async (req, res) => {
  try {
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM entries');
    const prizes = await pool.query(
      `SELECT p.id, p.name, p.image_url, p.position, p.status,
              r.winner_name, r.winner_email, r.winner_phone, r.winner_instagram, r.winner_tiktok, r.drawn_at
       FROM prizes p LEFT JOIN raffles r ON r.id = p.raffle_id
       WHERE p.status = 'pending' OR (p.status = 'drawn' AND r.drawn_at > NOW() - INTERVAL '60 days')
       ORDER BY p.status DESC, p.position, p.id`
    );
    res.json({ entries: count.rows[0].n, prizes: prizes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar el resumen' });
  }
});

router.post('/admin/prizes', async (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 120);
  const imageUrl = String((req.body || {}).imageUrl || '').trim().slice(0, 500) || null;
  const position = parseInt((req.body || {}).position, 10) || 0;
  if (!name) return res.status(400).json({ error: 'Escribe el nombre del premio.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO prizes (name, image_url, position) VALUES ($1, $2, $3) RETURNING *',
      [name, imageUrl, position]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar el premio' });
  }
});

router.delete('/admin/prizes/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE prizes SET status = 'removed' WHERE id = $1 AND status = 'pending'`,
    [req.params.id]
  ).catch(err => { console.error(err); return { rowCount: -1 }; });
  if (rowCount === -1) return res.status(500).json({ error: 'No se pudo quitar el premio' });
  if (!rowCount) return res.status(404).json({ error: 'Ese premio no existe o ya fue sorteado' });
  res.json({ ok: true });
});

// Lista de inscritos en CSV (para tu base de contactos)
router.get('/admin/entries.csv', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, email, phone, tiktok, instagram, birth_date, created_at FROM entries ORDER BY id');
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Nombre,Correo,Celular,TikTok,Instagram,Nacimiento,Inscripción']
      .concat(rows.map(r => [r.name, r.email, r.phone, r.tiktok, r.instagram, r.birth_date ? r.birth_date.toISOString().slice(0, 10) : '', r.created_at.toISOString()].map(cell).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inscritos-nadaesfake.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo descargar la lista' });
  }
});

// Sortear un premio. Reglas:
// - Una persona gana un solo premio por fecha de transmisión.
// - Quien gana vuelve a participar recién después de 3 transmisiones.
router.post('/admin/draw', async (req, res) => {
  const prizeId = parseInt((req.body || {}).prizeId, 10);
  if (!prizeId) return res.status(400).json({ error: 'Falta el premio a sortear' });

  const today = limaToday();
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(777)'); // un sorteo a la vez

    const prizeQ = await client.query(
      `SELECT * FROM prizes WHERE id = $1 AND status = 'pending' FOR UPDATE`, [prizeId]
    );
    if (!prizeQ.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese premio ya fue sorteado o no existe' });
    }
    const prize = prizeQ.rows[0];

    // Las 3 transmisiones anteriores a hoy
    const prev = await client.query(
      `SELECT DISTINCT event_date FROM raffles
       WHERE kind = 'free' AND event_date < $1
       ORDER BY event_date DESC LIMIT 3`, [today]
    );
    const blockedDates = [today, ...prev.rows.map(r => r.event_date.toISOString().slice(0, 10))];

    const eligible = await client.query(
      `SELECT id, name, email, phone, instagram, tiktok FROM entries
       WHERE id NOT IN (
         SELECT winner_entry_id FROM raffles
         WHERE kind = 'free' AND winner_entry_id IS NOT NULL AND event_date = ANY($1::date[])
       )
       ORDER BY id`, [blockedDates]
    );
    if (!eligible.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No hay participantes disponibles para este sorteo' });
    }

    const pick = crypto.randomInt(eligible.rows.length); // aleatorio seguro
    const winner = eligible.rows[pick];

    const { rows } = await client.query(
      `INSERT INTO raffles (prize, drawn_at, winner_name, winner_email, winner_phone, winner_instagram, winner_tiktok,
                            total_tickets, participants, winning_ticket, winner_entry_id, event_date, kind)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, 'free') RETURNING id`,
      [prize.name, winner.name, winner.email, winner.phone, winner.instagram, winner.tiktok,
       eligible.rows.length, pick + 1, winner.id, today]
    );
    await client.query(`UPDATE prizes SET status = 'drawn', raffle_id = $1 WHERE id = $2`, [rows[0].id, prize.id]);
    await client.query('COMMIT');

    result = {
      raffleId: rows[0].id,
      prize: prize.name,
      participants: eligible.rows.length,
      winningNumber: pick + 1,
      winner: { name: winner.name, shortName: shortName(winner.name), email: winner.email, phone: winner.phone, instagram: winner.instagram, tiktok: winner.tiktok }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: 'Error al realizar el sorteo' });
  } finally {
    client.release();
  }

  sendFreeWinnerEmail({ email: result.winner.email, name: result.winner.name.split(' ')[0], prize: result.prize })
    .catch(e => console.error('Correo al ganador:', e.message));
  res.status(201).json(result);
});

module.exports = router;
