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

// ── Google OAuth ──────────────────────────────────────────
// 1. Frontend redirige a: GET /api/auth/google?role=provider|seeker&ref=CODIGO
// 2. Google redirige a:   GET /api/auth/google/callback
// 3. Backend redirige a:  FRONTEND_URL/auth/google-success?token=JWT&role=ROLE
//
// Variables de entorno necesarias:
//   GOOGLE_CLIENT_ID     → Google Cloud Console
//   GOOGLE_CLIENT_SECRET → Google Cloud Console
//   (agregar en Backend/.env)
//
// En Google Cloud Console, agregar como "Authorized redirect URI":
//   https://api.zonaservicios.com.ar/api/auth/google/callback
//   http://localhost:5000/api/auth/google/callback (dev)
router.get('/google',          googleAuth);
router.get('/google/callback', googleCallback);

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