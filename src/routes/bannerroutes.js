const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const {
  getActiveBanners,
  getBannerPrices,
  createBannerCheckout,
  bannerWebhook,
  uploadBannerImage,
  getMyBanners,
  adminListBanners,
  adminUpdateBanner,
  adminUploadBannerImage,
  adminDeleteBanner,
} = require('../controllers/bannercontroller');

const router = express.Router();

// ── Multer ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/banners/'),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `banner-${uuidv4()}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error('Solo JPG, PNG o WebP'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Rutas públicas ────────────────────────────────────────
router.get('/active',  getActiveBanners);
router.get('/prices',  getBannerPrices);
router.post('/webhook', bannerWebhook);

// ── Rutas prestador ───────────────────────────────────────
router.get('/my',      protect, authorizeRoles('provider'), getMyBanners);
router.post('/checkout', protect, authorizeRoles('provider'), createBannerCheckout);
router.post('/:id/upload-image', protect, authorizeRoles('provider'), upload.single('image'), uploadBannerImage);

// ── Rutas admin ───────────────────────────────────────────
router.get('/admin',         protect, authorizeRoles('admin'), adminListBanners);
router.patch('/admin/:id',   protect, authorizeRoles('admin'), adminUpdateBanner);
router.post('/admin/:id/upload-image', protect, authorizeRoles('admin'), upload.single('image'), adminUploadBannerImage);
router.delete('/admin/:id',  protect, authorizeRoles('admin'), adminDeleteBanner);

module.exports = router;