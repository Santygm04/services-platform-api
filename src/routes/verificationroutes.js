const express = require('express');
const multer = require('multer');
const path = require('path');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const {
  uploadDniFront,
  uploadDniBack,
  uploadSelfie,
  submitVerification,
  getMyVerification,
  listVerifications,
  approveVerification,
  rejectVerification,
  getVerificationDetail,
  deleteVerification,
} = require('../controllers/verificationcontroller');

const router = express.Router();

// ── Multer config — memoria (las fotos van a Cloudinary, no a disco) ──
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

// ── Rutas del prestador ───────────────────────────────────
router.get('/me',       protect, getMyVerification);
router.post('/submit',  protect, submitVerification);
router.post('/dni-front', protect, upload.single('image'), uploadDniFront);
router.post('/dni-back',  protect, upload.single('image'), uploadDniBack);
router.post('/selfie',    protect, upload.single('image'), uploadSelfie);

// ── Rutas admin ───────────────────────────────────────────
// IMPORTANTE: /admin/list ANTES de /admin/:userId para evitar que intercepte
router.get('/admin/list',              protect, authorizeRoles('admin'), listVerifications);

// FIX: ruta DELETE para eliminar verificaciones huérfanas (por _id del documento)
router.delete('/admin/:id',            protect, authorizeRoles('admin'), deleteVerification);

router.get('/admin/:userId',           protect, authorizeRoles('admin'), getVerificationDetail);
router.patch('/admin/:userId/approve', protect, authorizeRoles('admin'), approveVerification);
router.patch('/admin/:userId/reject',  protect, authorizeRoles('admin'), rejectVerification);

module.exports = router;