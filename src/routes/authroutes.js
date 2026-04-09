const express = require('express');
const router = express.Router();
const {
  registerSeeker,
  registerProvider,
  adminCheck,
  adminSetup,
  registerAdmin,
  login,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authcontroller');
const { protect } = require('../middlewares/authmiddleware');

// Registro normal
router.post('/register-seeker',      registerSeeker);
router.post('/register-provider',    registerProvider);

// Registro admin
router.get('/admin-check',           adminCheck);       // chequea si ya hay admin
router.post('/admin-setup',          adminSetup);       // primer admin (solo si no hay ninguno)
router.post('/register-admin',       registerAdmin);    // con código de invitación

// Auth
router.post('/login',                login);
router.get('/me',                    protect, getMe);
router.post('/verify-email',         verifyEmail);
router.post('/resend-verification',  protect, resendVerification);
router.post('/forgot-password',      forgotPassword);
router.post('/reset-password',       resetPassword);
router.patch('/change-password',     protect, changePassword);

module.exports = router;