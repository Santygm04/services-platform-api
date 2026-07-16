const express = require('express');
const multer  = require('multer');
const { protect }        = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const {
  getActiveBanners,
  getBannerPrices,
  createBannerCheckout,
  bannerWebhook,
  uploadBannerImage,
  getMyBanners,
  adminCreateBanner,
  adminListBanners,
  adminUpdateBanner,
  adminUploadBannerImage,
  adminDeleteBanner,
} = require('../controllers/bannercontroller');

const router = express.Router();

// ── Multer (memoria → Cloudinary) ────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'), false);
  },
});

// ── Rutas públicas ────────────────────────────────────────
router.get('/active',   getActiveBanners);
router.get('/prices',   getBannerPrices);
router.post('/webhook', bannerWebhook);

// ── Config pública (ofertas activas para Publicidad.jsx) ──
const SiteConfig = require('../models/siteconfig');
router.get('/config/public', async (req, res) => {
  try {
    const config = await SiteConfig.getSingleton();
    res.json({ config: { offers: config?.offers || [] } });
  } catch {
    res.json({ config: { offers: [] } });
  }
});

// ── Redirects de MP → reenvían al frontend ────────────────
router.get('/redirect/success', (req, res) => {
  const { bannerId = '' } = req.query;
  const url = `${process.env.FRONTEND_URL}/banner/success?bannerId=${bannerId}`;
  console.log(`[MP Banner Redirect] SUCCESS → ${url}`);
  res.redirect(url);
});

router.get('/redirect/failure', (req, res) => {
  const url = `${process.env.FRONTEND_URL}/banner/failure`;
  console.log(`[MP Banner Redirect] FAILURE → ${url}`);
  res.redirect(url);
});

router.get('/redirect/pending', (req, res) => {
  const { bannerId = '' } = req.query;
  const url = `${process.env.FRONTEND_URL}/banner/pending?bannerId=${bannerId}`;
  console.log(`[MP Banner Redirect] PENDING → ${url}`);
  res.redirect(url);
});

// ── Rutas prestador ───────────────────────────────────────
router.get('/my',      protect, authorizeRoles('provider'), getMyBanners);
router.post('/checkout', protect, authorizeRoles('provider'), createBannerCheckout);
router.post('/:id/upload-image', protect, authorizeRoles('provider'), upload.single('image'), uploadBannerImage);

// ── Rutas admin ───────────────────────────────────────────
router.get('/admin',                  protect, authorizeRoles('admin'), adminListBanners);
router.post('/admin',                 protect, authorizeRoles('admin'), adminCreateBanner);
router.patch('/admin/:id',            protect, authorizeRoles('admin'), adminUpdateBanner);
router.post('/admin/:id/upload-image',protect, authorizeRoles('admin'), upload.single('image'), adminUploadBannerImage);
router.delete('/admin/:id',           protect, authorizeRoles('admin'), adminDeleteBanner);

module.exports = router;