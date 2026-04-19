const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const ProviderProfile = require('../models/providerprofile');

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
  getMetrics, getActivity, getLiveSnapshot,
  getFeaturedProviders, toggleUrgency,
  getUsers, getUserDetail, exportUsers,
  bulkAction, blockUser, unblockUser, deactivateUser, reactivateUser, deleteUser,
  verifyProvider, unverifyProvider, upgradePlan,
  getReviews, hideReview, showReview,
  globalSearch, verifyUserEmail,
  getAdminBanners, updateAdminBanner, deleteAdminBanner, createAdminBanner,
  deleteGhostProvider,
} = require('../controllers/admincontroller');

router.use(protect);
router.use(authorizeRoles('admin'));

router.get('/metrics',  getMetrics);
router.get('/activity', getActivity);
router.get('/live',     getLiveSnapshot);
router.get('/search',   globalSearch);

router.get('/users/export',             exportUsers);
router.patch('/users/bulk',             bulkAction);
router.get('/users',                    getUsers);
router.get('/users/:id',                getUserDetail);
router.patch('/users/:id/block',        blockUser);
router.patch('/users/:id/unblock',      unblockUser);
router.patch('/users/:id/deactivate',   deactivateUser);
router.patch('/users/:id/reactivate',   reactivateUser);
router.delete('/users/:id',             deleteUser);
router.patch('/users/:id/verify-email', verifyUserEmail);

router.get('/providers/featured',       getFeaturedProviders);
router.delete('/providers/ghost/:id',   deleteGhostProvider);
router.patch('/providers/:id/verify',   verifyProvider);
router.patch('/providers/:id/unverify', unverifyProvider);
router.patch('/providers/:id/upgrade',  upgradePlan);
router.patch('/providers/:id/urgency',  toggleUrgency);

// ── NUEVA: editar zona y descripción desde admin ──────────
router.patch('/providers/:id/edit', async (req, res) => {
  try {
    const { zone, description } = req.body;
    const update = {};
    if (zone        !== undefined) update.zone        = zone;
    if (description !== undefined) update.description = description;
    const profile = await ProviderProfile.findByIdAndUpdate(
      req.params.id, update, { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    res.json({ message: 'Perfil actualizado', profile });
  } catch (err) {
    console.error('editProvider:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

// ── NUEVA: estadísticas individuales de un prestador ─────
router.get('/providers/:id/stats', async (req, res) => {
  try {
    const Review = require('../models/review');
    const profile = await ProviderProfile.findById(req.params.id)
      .populate('userId', 'name email createdAt');
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });

    const reviews = await Review.find({ providerId: req.params.id, hidden: false })
      .populate('reviewerId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      profile,
      stats: {
        plan:          profile.plan,
        verified:      profile.verified,
        rating:        profile.ratingAverage,
        reviewsCount:  profile.reviewsCount,
        zone:          profile.zone,
        profession:    profile.profession,
        urgency:       profile.urgencyAvailable,
        memberSince:   profile.userId?.createdAt,
      },
      latestReviews: reviews,
    });
  } catch (err) {
    console.error('providerStats:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/reviews',             getReviews);
router.patch('/reviews/:id/hide',  hideReview);
router.patch('/reviews/:id/show',  showReview);

router.get('/banners',             getAdminBanners);
router.post('/banners',            createAdminBanner);
router.patch('/banners/:id',       updateAdminBanner);
router.delete('/banners/:id',      deleteAdminBanner);

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