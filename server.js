require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { init } = require('./db');

const subscribersRoutes = require('./routes/subscribers');
const rafflesRoutes = require('./routes/raffles');
const paymentsRoutes = require('./routes/payments');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/subscribers', subscribersRoutes);
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
