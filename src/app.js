const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());

// Ruta de salud — para verificar que el server responde
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Zona Servicios API funcionando' });
});

// Rutas (se van agregando a medida que se crean)
// app.use('/api/auth', require('./routes/authRoutes'));

module.exports = app;