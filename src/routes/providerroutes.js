const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  trackView,
  getMyStats,
  getAllProviders,
  getNearbyActivity,
  getNearbySeekersForMe,
  toggleActiveStatus,
} = require('../controllers/providercontroller');
const { protect, requireEmailVerified, optionalAuth } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const { getProviderReviews } = require('../controllers/reviewcontroller');

// ── Públicas — lista ──
router.get('/', getAllProviders);

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

module.exports = router;