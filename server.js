require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { expireBanners } = require('./src/controllers/bannercontroller');

const PORT = process.env.PORT || 5000;

connectDB();

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} — modo ${process.env.NODE_ENV}`);

  // Expirar banners vencidos cada hora
  setInterval(expireBanners, 1000 * 60 * 60);
  expireBanners(); // también al arrancar
});