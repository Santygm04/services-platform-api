const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  getProfileByUserId,
  trackView,
  getMyStats,
  getAllProviders,
  getNearbyActivity,
  getNearbySeekersForMe,
  toggleActiveStatus,
  getPublicStats,
} = require('../controllers/providercontroller');
const { protect, requireEmailVerified, optionalAuth } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const { getProviderReviews } = require('../controllers/reviewcontroller');

// ── Públicas — lista ──
router.get('/', getAllProviders);

// ── Pública — contadores reales para el Home ──
// IMPORTANTE: va antes de /:id, sino Express interpreta "stats" como un ID
router.get('/stats/public', getPublicStats);

// ── Protegidas /me — DEBEN ir SIEMPRE antes de /:id ──
router.get('/me/profile',         protect, authorizeRoles('provider'), getMyProfile);
router.patch('/me/profile',       protect, authorizeRoles('provider'), requireEmailVerified, updateMyProfile);
router.get('/me/stats',           protect, authorizeRoles('provider'), getMyStats);
router.get('/me/nearby-seekers',  protect, authorizeRoles('provider'), getNearbySeekersForMe);

// ── Toggle activo/inactivo ────────────────────────────────
router.patch('/me/active-status', protect, authorizeRoles('provider'), toggleActiveStatus);

// ── Rutas con :id — van DESPUÉS de /me ──
router.get('/:id',                optionalAuth, getPublicProfile);
router.post('/:id/view',          trackView);
router.get('/:id/reviews',        getProviderReviews);
router.get('/:id/nearby-seekers', getNearbyActivity);
// ── Buscar perfil por userId (para mensajes) ──
router.get('/by-user/:userId', optionalAuth, getProfileByUserId);

// ── Rutas con :id — van DESPUÉS de /me ──
router.get('/:id',                optionalAuth, getPublicProfile);
module.exports = router;