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

// Rutas
app.use('/api/auth', require('./routes/authroutes'));

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Error interno del servidor' });
});

module.exports = app;