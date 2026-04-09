const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes jpg, png, webp'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
const {
  getMetrics,
  getActivity,
  getLiveSnapshot,
  getFeaturedProviders,
  toggleUrgency,
  getUsers,
  getUserDetail,
  exportUsers,
  bulkAction,
  blockUser,
  unblockUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  verifyProvider,
  unverifyProvider,
  upgradePlan,
  getReviews,
  hideReview,
  showReview,
  globalSearch,
  verifyUserEmail,
  getAdminBanners,
  updateAdminBanner,
  deleteAdminBanner,
  createAdminBanner,
  deleteGhostProvider,
} = require('../controllers/admincontroller');

// Todas las rutas requieren estar autenticado y ser admin
router.use(protect);
router.use(authorizeRoles('admin'));

// ── Métricas, actividad y live ───────────────────────────
router.get('/metrics',  getMetrics);
router.get('/activity', getActivity);
router.get('/live',     getLiveSnapshot);

// ── Búsqueda global ──────────────────────────────────────
router.get('/search', globalSearch);

// ── Usuarios — rutas específicas ANTES de /:id ──────────
router.get('/users/export',                exportUsers);
router.patch('/users/bulk',                bulkAction);
router.get('/users',                       getUsers);
router.get('/users/:id',                   getUserDetail);
router.patch('/users/:id/block',           blockUser);
router.patch('/users/:id/unblock',         unblockUser);
router.patch('/users/:id/deactivate',      deactivateUser);
router.patch('/users/:id/reactivate',      reactivateUser);
router.delete('/users/:id',                deleteUser);
router.patch('/users/:id/verify-email',    verifyUserEmail);

// ── Prestadores — /featured y /ghost/:id ANTES de /:id ─────
router.get('/providers/featured',          getFeaturedProviders);
router.delete('/providers/ghost/:id',      deleteGhostProvider);  // ← FIX: eliminar fantasmas
router.patch('/providers/:id/verify',      verifyProvider);
router.patch('/providers/:id/unverify',    unverifyProvider);
router.patch('/providers/:id/upgrade',     upgradePlan);
router.patch('/providers/:id/urgency',     toggleUrgency);

// ── Reseñas ──────────────────────────────────────────────
router.get('/reviews',                     getReviews);
router.patch('/reviews/:id/hide',          hideReview);
router.patch('/reviews/:id/show',          showReview);

// ── Banners ──────────────────────────────────────────────
router.get('/banners',                     getAdminBanners);
router.post('/banners',                    createAdminBanner);
router.patch('/banners/:id',               updateAdminBanner);
router.delete('/banners/:id',              deleteAdminBanner);

// ── POST /api/admin/upload — subir imagen desde admin a Cloudinary ──
router.post('/upload', uploadMemory.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió imagen' });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'zonaservicios/banners', resource_type: 'image' },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error('Admin upload error:', err);
    res.status(500).json({ message: 'Error al subir imagen' });
  }
});

module.exports = router;