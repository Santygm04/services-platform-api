const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria'],
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
    },
    role: {
      type: String,
      enum: ['seeker', 'provider', 'admin', 'both'],
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'blocked', 'inactive'],
      default: 'active',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },

    // ── Google OAuth ──────────────────────────────────────
    // ID único que devuelve Google al autenticar.
    // null para usuarios registrados con email/password.
    googleId: {
      type: String,
      default: null,
      sparse: true,
    },
    // ── Facebook OAuth ────────────────────────────────────
    // ID único que devuelve Facebook al autenticar.
    // null para usuarios registrados con email/password o Google.
    facebookId: {
      type: String,
      default: null,
      sparse: true,
    },
    activeRole: {
      type: String,
      enum: ['provider', 'seeker', null],
      default: null,
    },
    pendingRoleVerification: {
      type: String,
      enum: ['provider', 'seeker', null],
      default: null,
    },
  },
  { timestamps: true }
);

// ── Pre-save: encriptar password ──────────────────────────
// Solo hashea si el password fue modificado.
// Los usuarios de Google tienen password aleatorio — también se hashea
// pero nunca se usa para login (siempre entran por OAuth).
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Método: comparar password en login ───────────────────
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ── Índice sparse en googleId / facebookId ────────────────
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ facebookId: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);