const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  getFavorites,
  addFavorite,
  removeFavorite,
  getContactHistory,
  registerContact,
} = require('../controllers/seekercontroller');
const { protect, requireEmailVerified } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// Todas protegidas — solo seekers
router.use(protect, authorizeRoles('seeker'));

router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);

router.get('/me/favorites', getFavorites);
router.post('/me/favorites/:providerId', addFavorite);
router.delete('/me/favorites/:providerId', removeFavorite);

router.get('/me/contact-history', getContactHistory);
router.post('/me/contact/:providerId', requireEmailVerified, registerContact);

module.exports = router;