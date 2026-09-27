require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { init } = require('./db');

const subscribersRoutes = require('./routes/subscribers');
const rafflesRoutes = require('./routes/raffles');
const paymentsRoutes = require('./routes/payments');
const billingRoutes = require('./routes/billing');

const app = express();
app.use(cors());
app.use(express.json());

// Solo deja pasar a quien tenga la clave de administrador
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_KEY no configurada' });
  }
  const given = req.get('x-admin-key') || req.query.key || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// Panel de administración
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel.html'));
});

// Configuración pública para la landing (la llave pública no es secreta)
app.get('/api/config', (req, res) => {
  res.json({ culqiPublicKey: process.env.CULQI_PUBLIC_KEY || '' });
});

// Rutas privadas (solo administrador)
app.use('/api/subscribers', requireAdmin, subscribersRoutes);
app.post('/api/raffles/draw', requireAdmin);
app.use('/api/billing', requireAdmin, billingRoutes);

// Rutas públicas
app.use('/api/raffles', rafflesRoutes);
app.use('/api/payments', paymentsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

init()
  .then(() => {
    console.log('Base de datos lista');
    app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
  })
  .catch(err => {
    console.error('No se pudo conectar a la base de datos:', err);
    process.exit(1);
  });
