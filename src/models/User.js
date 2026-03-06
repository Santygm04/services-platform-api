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
      enum: ['seeker', 'provider', 'admin'],
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
      enum: ['active', 'blocked'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// Encriptar password antes de guardar — compatible con Mongoose 9
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar password en login
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('user', userSchema);