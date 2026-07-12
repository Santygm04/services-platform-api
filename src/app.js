const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const authRoutes         = require('./routes/authroutes');
const providerRoutes     = require('./routes/providerroutes');
const seekerRoutes       = require('./routes/seekerroutes');
const searchRoutes       = require('./routes/searchroutes');
const reviewRoutes       = require('./routes/reviewroutes');
const categoryRoutes     = require('./routes/categoryroutes');
const uploadRoutes       = require('./routes/uploadroutes');
const adminRoutes        = require('./routes/adminroutes');
const subscriptionRoutes = require('./routes/suscriptionroutes');
const verificationRoutes = require('./routes/verificationroutes');
const bannerRoutes       = require('./routes/bannerroutes');
const eventRoutes        = require('./routes/eventroutes');
const messageRoutes      = require('./routes/messageroutes');
const notificationRoutes = require('./routes/notificationroutes');
const analyticsRoutes    = require('./routes/analyticsroutes');
const siteConfigRoutes   = require('./routes/siteconfigroutes');
const reportRoutes       = require('./routes/reportroutes');
const app = express();

app.set('etag', false);

if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://services-platform-web.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permite requests sin origin (Postman, mobile apps, webviews de Instagram/Facebook)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Permite webviews de redes sociales (Instagram, Facebook, etc.)
    if (/^https?:\/\/(www\.)?(instagram\.com|facebook\.com|fbcdn\.net)(\/|$)/i.test(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado para origen: ${origin}`));
  },
  credentials: true,
}));

app.use(helmet());
app.use(mongoSanitize({ onlyAllowDotNotation: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { message: 'Demasiados intentos, esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/providers',     providerRoutes);
app.use('/api/seekers',       seekerRoutes);
app.use('/api/search',        searchRoutes);
app.use('/api/reviews',       reviewRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/categories',    categoryRoutes);
app.use('/api/upload',        uploadRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/verification',  verificationRoutes);
app.use('/api/banners',       bannerRoutes);
app.use('/api/events',        eventRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/config',          siteConfigRoutes);

// ── Sitemap SEO ──────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  try {
    const ProviderProfile = require('./models/ProviderProfile');
    const profiles = await ProviderProfile.find({ slug: { $exists: true, $ne: null } })
      .select('slug updatedAt')
      .lean();

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemapindex.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${today}</lastmod>
  </url>
  <url>
    <loc>${baseUrl}/search</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
    <lastmod>${today}</lastmod>
  </url>
  <url>
    <loc>${baseUrl}/planes</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/terminos</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/privacidad</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
<url>
    <loc>${baseUrl}/electricistas</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/plomeros</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/pintores</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/gasistas</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/cerrajeros</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/albaniles</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/carpinteros</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/jardineros</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/fumigadores</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/herreros</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
 <url>
    <loc>${baseUrl}/como-funciona</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
${profiles.map(p => `  <url>
    <loc>${baseUrl}/s/${p.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${p.updatedAt ? `
    <lastmod>${new Date(p.updatedAt).toISOString().split('T')[0]}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Error generando sitemap');
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' }));

app.use((req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl} →`, err.message || err);
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ message: 'El archivo es demasiado grande' });
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }
  if (err.name === 'CastError')
    return res.status(400).json({ message: 'ID inválido' });
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
    return res.status(401).json({ message: 'Token inválido o expirado' });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Error interno del servidor' });
});

module.exports = app;