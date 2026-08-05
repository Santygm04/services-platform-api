const { body, validationResult } = require('express-validator');

// ── Helper ─────────────────────────────────────────────────
const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map(v => v.run(req)));
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
};

// ── Auth ───────────────────────────────────────────────────
const registerSeekerValidator = validate([
  body('name').isString().trim().notEmpty().withMessage('Nombre requerido')
    .isLength({ max: 100 }).withMessage('Nombre demasiado largo'),
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('zone').optional().isString().trim()
    .isLength({ max: 150 }).withMessage('Zona demasiado larga'),
]);

const registerProviderValidator = validate([
  body('name').isString().trim().notEmpty().withMessage('Nombre requerido')
    .isLength({ max: 100 }).withMessage('Nombre demasiado largo'),
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('referralCode').optional().isString().trim()
    .isLength({ max: 20 }).withMessage('Código de referido inválido'),
]);

const loginValidator = validate([
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('Contraseña requerida'),
]);

const resetPasswordValidator = validate([
  body('token').notEmpty().withMessage('Token requerido'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
]);

const changePasswordValidator = validate([
  body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
  body('newPassword').isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
]);

// ── Mensajes ───────────────────────────────────────────────
const sendMessageValidator = validate([
  body('receiverId').notEmpty().withMessage('receiverId requerido')
    .isMongoId().withMessage('receiverId inválido'),
  body('content').isString().trim().notEmpty().withMessage('El mensaje no puede estar vacío')
    .isLength({ max: 1000 }).withMessage('Mensaje demasiado largo'),
]);

// ── Reviews ────────────────────────────────────────────────
const createReviewValidator = validate([
  body('rating').isInt({ min: 1, max: 5 }).withMessage('El rating debe ser entre 1 y 5'),
  body('comment').isString().trim().notEmpty().withMessage('El comentario es requerido')
    .isLength({ max: 1000 }).withMessage('Comentario demasiado largo'),
]);

// ── Provider profile update ────────────────────────────────
const updateProfileValidator = validate([
  body('profession').optional().isString().trim().isLength({ max: 100 }).withMessage('Profesión demasiado larga'),
  body('zone').optional().isString().trim().isLength({ max: 150 }).withMessage('Zona demasiado larga'),
  body('bio').optional().isString().trim().isLength({ max: 500 }).withMessage('Bio demasiado larga'),
  body('phone').optional().isString().trim().isLength({ max: 20 }).withMessage('Teléfono inválido'),
]);

module.exports = {
  registerSeekerValidator,
  registerProviderValidator,
  loginValidator,
  resetPasswordValidator,
  changePasswordValidator,
  sendMessageValidator,
  createReviewValidator,
  updateProfileValidator,
};