const express = require('express');
const router = express.Router();
const {
  registerSeeker,
  registerProvider,
  login,
  getMe,
  verifyEmail,
  resendVerification,
} = require('../controllers/authcontroller');
const { protect } = require('../middlewares/authmiddleware');

// Públicas
router.post('/register-seeker', registerSeeker);
router.post('/register-provider', registerProvider);
router.post('/login', login);
router.post('/verify-email', verifyEmail);

// Protegidas (requieren JWT)
router.get('/me', protect, getMe);
router.post('/resend-verification', protect, resendVerification);

module.exports = router;