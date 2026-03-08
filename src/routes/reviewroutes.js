const express = require('express');
const router = express.Router();
const {
  createReview,
  getProviderReviews,
  replyToReview,
  reportReview,
  deleteReview,
} = require('../controllers/reviewcontroller');
const { protect, requireEmailVerified } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// Pública — ver reseñas de un prestador
router.get('/providers/:id/reviews', getProviderReviews);

// Protegidas — solo seekers registrados pueden crear reseñas
router.post('/', protect, requireEmailVerified, authorizeRoles('seeker'), createReview);
router.patch('/:reviewId/report', protect, requireEmailVerified, reportReview);

// Solo providers Plus pueden responder
router.post('/:reviewId/reply', protect, requireEmailVerified, authorizeRoles('provider'), replyToReview);

// Solo admin puede eliminar
router.delete('/:reviewId', protect, authorizeRoles('admin'), deleteReview);

module.exports = router;