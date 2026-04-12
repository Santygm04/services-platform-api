const express = require('express');
const multer  = require('multer');
const { protect }         = require('../middlewares/authmiddleware');
const { authorizeRoles }  = require('../middlewares/rolemiddleware');
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
// NO se guarda en disco. El buffer se sube a Cloudinary en el controller.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
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

// ── Rutas prestador ───────────────────────────────────────
router.get('/my',
  protect, authorizeRoles('provider'),
  getMyBanners
);

router.post('/checkout',
  protect, authorizeRoles('provider'),
  createBannerCheckout
);

router.post('/:id/upload-image',
  protect, authorizeRoles('provider'),
  upload.single('image'),
  uploadBannerImage
);

// ── Rutas admin ───────────────────────────────────────────
// GET    /api/admin/banners             → listar (con filtros ?status=&position=)
// POST   /api/admin/banners             → crear sin pago
// PATCH  /api/admin/banners/:id         → actualizar
// POST   /api/admin/banners/:id/upload-image → subir imagen
// DELETE /api/admin/banners/:id         → eliminar

router.get('/admin',
  protect, authorizeRoles('admin'),
  adminListBanners
);

router.post('/admin',
  protect, authorizeRoles('admin'),
  adminCreateBanner
);

router.patch('/admin/:id',
  protect, authorizeRoles('admin'),
  adminUpdateBanner
);

router.post('/admin/:id/upload-image',
  protect, authorizeRoles('admin'),
  upload.single('image'),
  adminUploadBannerImage
);

router.delete('/admin/:id',
  protect, authorizeRoles('admin'),
  adminDeleteBanner
);

module.exports = router;