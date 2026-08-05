const express = require('express');
const router  = express.Router();
const {
  adminCheck, setActiveRole, adminSetup, registerAdmin,
  registerSeeker, registerProvider,
  login, getMe, verifyEmail, resendVerification,
  forgotPassword, resetPassword, changePassword,
  googleAuth, googleCallback,
  facebookAuth, facebookCallback,
  adminUpgradePlan,
} = require('../controllers/authcontroller');

const rateLimit          = require('express-rate-limit');
const { protect }        = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const {
  registerSeekerValidator,
  registerProviderValidator,
  loginValidator,
  resetPasswordValidator,
  changePasswordValidator,
} = require('../middlewares/validators');

const adminRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: 'Demasiados intentos.' },
});

// ── Registro ──────────────────────────────────────────────
router.post('/register-seeker',   registerSeekerValidator,   registerSeeker);
router.post('/register-provider', registerProviderValidator, registerProvider);

// ── Admin ─────────────────────────────────────────────────
router.get('/admin-check',     adminCheck);
router.post('/admin-setup',    adminSetup);
router.post('/register-admin', adminRegisterLimiter, registerAdmin);

// ── Login / sesión ────────────────────────────────────────
router.post('/login',               loginValidator,          login);
router.get('/me',                   protect,                 getMe);
router.post('/verify-email',        verifyEmail);
router.post('/resend-verification', protect,                 resendVerification);
router.post('/forgot-password',     forgotPassword);
router.post('/reset-password',      resetPasswordValidator,  resetPassword);
router.patch('/change-password',    protect, changePasswordValidator, changePassword);
router.patch('/active-role',        protect, setActiveRole);

// ── Google OAuth ──────────────────────────────────────────
router.get('/google',          googleAuth);
router.get('/google/callback', googleCallback);

// ── Facebook OAuth ────────────────────────────────────────
router.get('/facebook',          facebookAuth);
router.get('/facebook/callback', facebookCallback);

// ── Plan upgrade (admin) ──────────────────────────────────
router.patch('/admin/upgrade-plan/:userId', protect, authorizeRoles('admin'), adminUpgradePlan);

module.exports = router;