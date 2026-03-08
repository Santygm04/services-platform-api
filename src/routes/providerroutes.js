const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  trackView,
  getMyStats,
  getAllProviders,
} = require('../controllers/providercontroller');
const { protect, requireEmailVerified } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// Públicas
router.get('/', getAllProviders);
router.get('/:id', getPublicProfile); // optionally authenticated
router.post('/:id/view', trackView);

// Protegidas — solo providers
router.get('/me/profile', protect, authorizeRoles('provider'), getMyProfile);
router.patch('/me/profile', protect, authorizeRoles('provider'), requireEmailVerified, updateMyProfile);
router.get('/me/stats', protect, authorizeRoles('provider'), getMyStats);
const { getProviderReviews } = require('../controllers/reviewcontroller');
router.get('/:id/reviews', getProviderReviews);
module.exports = router;