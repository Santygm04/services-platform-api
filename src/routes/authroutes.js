const express = require('express');
const router  = express.Router();
const {
  // Admin
  adminCheck,
  setActiveRole,
  adminSetup,
  registerAdmin,
  // Registro
  registerSeeker,
  registerProvider,
  // Auth
  login,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  // Google OAuth
  googleAuth,
  googleCallback,
  // Facebook OAuth
  facebookAuth,
  facebookCallback,
  // Plan
  upgradePlan,
  adminUpgradePlan,
} = require('../controllers/authcontroller');

const { protect }        = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// ── Registro normal ───────────────────────────────────────
router.post('/register-seeker',   registerSeeker);
router.post('/register-provider', registerProvider);

// ── Admin ─────────────────────────────────────────────────
router.get('/admin-check',      adminCheck);
router.post('/admin-setup',     adminSetup);
router.post('/register-admin',  registerAdmin);

// ── Login / sesión ────────────────────────────────────────
router.post('/login',               login);
router.get('/me',                   protect, getMe);
router.post('/verify-email',        verifyEmail);
router.post('/resend-verification', protect, resendVerification);
router.post('/forgot-password',     forgotPassword);
router.post('/reset-password',      resetPassword);
router.patch('/change-password',    protect, changePassword);
router.patch('/active-role',        protect, setActiveRole);



router.get('/google',          googleAuth);
router.get('/google/callback', googleCallback);


router.get('/facebook',          facebookAuth);
router.get('/facebook/callback', facebookCallback);

// ── Plan upgrade ──────────────────────────────────────────
// Prestador actualiza su propio plan (llamado desde frontend post-pago)
router.patch('/upgrade-plan',
  protect,
  authorizeRoles('provider'),
  upgradePlan
);

// Admin actualiza el plan de cualquier prestador
router.patch('/admin/upgrade-plan/:userId',
  protect,
  authorizeRoles('admin'),
  adminUpgradePlan
);

module.exports = router;