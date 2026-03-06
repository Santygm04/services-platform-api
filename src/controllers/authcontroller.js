const User = require('../models/user');
const ProviderProfile = require('../models/providerProfile');
const SeekerProfile = require('../models/seekerProfile');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ── Generar JWT ──────────────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ── Generar token de verificación de email ───────────────
const generateEmailToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// ── POST /api/auth/register-seeker ───────────────────────
const registerSeeker = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });
    }

    const emailToken = generateEmailToken();

    const user = await User.create({
      name,
      email,
      password,
      role: 'seeker',
      emailVerificationToken: emailToken,
    });

    // Crear perfil de buscador vacío
    await SeekerProfile.create({ userId: user._id });

    // TODO: enviar email de verificación con emailToken

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Cuenta creada. Verificá tu email para activarla.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error('registerSeeker error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/auth/register-provider ────────────────────
const registerProvider = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });
    }

    const emailToken = generateEmailToken();

    const user = await User.create({
      name,
      email,
      password,
      role: 'provider',
      emailVerificationToken: emailToken,
    });

    // Crear perfil de prestador vacío
    await ProviderProfile.create({ userId: user._id });

    // TODO: enviar email de verificación con emailToken

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Cuenta creada. Verificá tu email para activarla.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error('registerProvider error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/auth/login ─────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son obligatorios' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ message: 'Tu cuenta ha sido suspendida. Contactá al soporte.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('login error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/auth/me ─────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -emailVerificationToken');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ user });
  } catch (error) {
    console.error('getMe error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/auth/verify-email ──────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Token requerido' });
    }

    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Token inválido o expirado' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    await user.save();

    res.json({ message: 'Email verificado correctamente' });
  } catch (error) {
    console.error('verifyEmail error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/auth/resend-verification ───────────────────
const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.emailVerified) {
      return res.status(400).json({ message: 'El email ya está verificado' });
    }

    const emailToken = generateEmailToken();
    user.emailVerificationToken = emailToken;
    await user.save();

    // TODO: reenviar email con emailToken

    res.json({ message: 'Email de verificación reenviado' });
  } catch (error) {
    console.error('resendVerification error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  registerSeeker,
  registerProvider,
  login,
  getMe,
  verifyEmail,
  resendVerification,
};