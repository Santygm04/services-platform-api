const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  trackView,
  getMyStats,
  getAllProviders,
} = require('../controllers/providerController');
const { protect, requireEmailVerified } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Públicas
router.get('/', getAllProviders);
router.get('/:id', getPublicProfile); // optionally authenticated
router.post('/:id/view', trackView);

// Protegidas — solo providers
router.get('/me/profile', protect, authorizeRoles('provider'), getMyProfile);
router.patch('/me/profile', protect, authorizeRoles('provider'), requireEmailVerified, updateMyProfile);
router.get('/me/stats', protect, authorizeRoles('provider'), getMyStats);

module.exports = router;