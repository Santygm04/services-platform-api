const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { expireBanners } = require('./src/controllers/bannercontroller');

const PORT = process.env.PORT || 5000;

connectDB();

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:5174',
    ].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

// 🧠 usuarios online
const onlineUsers = new Map();

// ── Autenticación del socket vía JWT ─────────────────────
// El frontend debe conectar con: io(url, { auth: { token } })
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    // Permite conexión anónima (ej. visitantes que solo navegan búsquedas),
    // pero sin userId verificado no podrá unirse a ningún room privado.
    socket.data.userId = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = (decoded.id || decoded._id || decoded.userId)?.toString() || null;
  } catch (err) {
    socket.data.userId = null;
  }
  next();
});

io.on('connection', (socket) => {
  console.log('🟢 Socket conectado:', socket.id);

  socket.on('join', () => {
    const verifiedUserId = socket.data.userId;

    if (!verifiedUserId) {
      console.warn('⚠️ join intentado sin token válido, ignorando');
      return;
    }

    socket.join(verifiedUserId);
    onlineUsers.set(verifiedUserId, socket.id);
    console.log('✅ Usuario conectado (verificado):', verifiedUserId);
  });

  socket.on('disconnect', () => {
    for (let [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    console.log('🔴 Socket desconectado');
  });
});

// 🚀 exportar para usar en controllers
module.exports.io = io;
module.exports.onlineUsers = onlineUsers;

// 👇 IMPORTANTE: usar server.listen
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} — modo ${process.env.NODE_ENV}`);

  // ── Banners: expirar cada hora ────────────────────────
  setInterval(expireBanners, 1000 * 60 * 60);
  expireBanners();

  // ── Prestadores: desactivar tras 30 días de inactividad ──
  // Corre 1 vez al día a las 3am (o al arrancar el server)
  const { deactivateInactiveProviders } = require('./src/jobs/inactivityJob');
  deactivateInactiveProviders(); // ejecución inmediata al arrancar

  const ONE_DAY = 1000 * 60 * 60 * 24;
  setInterval(deactivateInactiveProviders, ONE_DAY);

  // ── Prestadores: avisar perfil incompleto / sin reseñas ──
  const { checkProfileHealth } = require('./src/jobs/profileHealthJob');
  checkProfileHealth(); // ejecución inmediata al arrancar
  setInterval(checkProfileHealth, ONE_DAY);
});

  