const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
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
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

// 🧠 usuarios online
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Socket conectado:', socket.id);

  socket.on('join', (userId) => {
  console.log('📥 BACK: join recibido de:', userId);
  socket.join(userId.toString()); // 🔥 CLAVE
    console.log('🏠 BACK: usuario unido a room:', userId);
  onlineUsers.set(userId.toString(), socket.id);
  console.log('Usuario conectado:', userId);
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
});

  