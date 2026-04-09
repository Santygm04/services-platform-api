const User = require('../models/user');
const ProviderProfile = require('../models/providerprofile');
const SeekerProfile = require('../models/seekerprofile');
const Notification = require('../models/notification');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require('../services/emailservice');


const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const generateEmailToken = () => crypto.randomBytes(32).toString('hex');

// ── Helper: notificar providers de la zona ───────────────────
const notifyProvidersInZone = async (seekerName, seekerZone) => {
  if (!seekerZone) return;
  try {
    const zoneWords = seekerZone.toLowerCase().trim().split(/[\s,]+/).filter(w => w.length >= 2);
    if (!zoneWords.length) return;

    const regexSource = zoneWords.join('|');
    const zoneRegex = new RegExp(regexSource, 'i');

    // Buscar providers con zona similar
    const providers = await ProviderProfile.find({ zone: { $regex: zoneRegex } })
      .select('userId zone')
      .limit(50);

    if (!providers.length) return;

    // Crear notificaciones en batch
    const notifications = providers.map(p => ({
      userId: p.userId,
      type: 'new_seeker_in_zone',
      title: `🔍 Nuevo buscador en tu zona`,
      body: `${seekerName} se registró en ${seekerZone}. ¡Puede necesitar tus servicios!`,
      meta: { seekerZone },
    }));

    await Notification.insertMany(notifications);
  } catch (err) {
    console.error('notifyProvidersInZone error:', err);
  }
};

// ── GET /api/auth/admin-check ────────────────────────────────
// Chequea si ya existe algún admin en la DB
const adminCheck = async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'admin' }).select('_id');
    res.json({ adminExists: !!adminExists });
  } catch (err) {
    console.error('adminCheck error:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── POST /api/auth/admin-setup ───────────────────────────────
// Solo funciona si NO hay ningún admin en la DB (setup inicial)
const adminSetup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    if (password.length < 8)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });

    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists)
      return res.status(403).json({ message: 'Ya existe un administrador. Usá el código de invitación para crear más.' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });

    const user = await User.create({
      name, email, password,
      role: 'admin',
      emailVerified: true,
    });

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Administrador creado exitosamente.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: 'admin', emailVerified: true },
    });
  } catch (err) {
    console.error('adminSetup error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/auth/register-admin ────────────────────────────
// Requiere código de invitación (ADMIN_INVITE_CODE en .env)
const registerAdmin = async (req, res) => {
  try {
    const { name, email, password, inviteCode } = req.body;
    if (!name || !email || !password || !inviteCode)
      return res.status(400).json({ message: 'Todos los campos son obligatorios (incluido el código de invitación)' });
    if (password.length < 8)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });

    const validCode = process.env.ADMIN_INVITE_CODE;
    if (!validCode)
      return res.status(503).json({ message: 'El registro de administradores no está habilitado. Configurá ADMIN_INVITE_CODE en el servidor.' });

    if (inviteCode.trim() !== validCode.trim())
      return res.status(403).json({ message: 'Código de invitación inválido' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });

    const user = await User.create({
      name, email, password,
      role: 'admin',
      emailVerified: true,
    });

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Administrador creado exitosamente.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: 'admin', emailVerified: true },
    });
  } catch (err) {
    console.error('registerAdmin error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Registro seeker ──────────────────────────────────────────
const registerSeeker = async (req, res) => {
  try {
    const { name, email, password, zone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });

    const emailToken = generateEmailToken();
    const user = await User.create({ name, email, password, role: 'seeker', emailVerificationToken: emailToken });
    await SeekerProfile.create({ userId: user._id, zone: zone?.trim() || '' });

    sendVerificationEmail(email, name, emailToken).catch(err => console.error('sendVerificationEmail error:', err));

    // Notificar providers en la zona — fire-and-forget
    if (zone?.trim()) {
      notifyProvidersInZone(name, zone.trim()).catch(() => {});
    }

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Cuenta creada. Revisá tu email para verificarla.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
    });
  } catch (err) {
    console.error('registerSeeker error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Registro provider ────────────────────────────────────────
const registerProvider = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log('1. Entró a registerProvider');

    if (!name || !email || !password) {
      console.log('2. Faltan campos');
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('3. Email normalizado:', normalizedEmail);

    const existing = await User.findOne({ email: normalizedEmail });
    console.log('4. existing:', !!existing);

    if (existing) {
      return res.status(409).json({ message: 'Ya existe una cuenta con ese email' });
    }

    const emailToken = generateEmailToken();
    console.log('5. emailToken generado');

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'provider',
      emailVerificationToken: emailToken,
    });
    console.log('6. User creado:', user._id.toString());

    const profile = await ProviderProfile.create({ userId: user._id });
    console.log('7. ProviderProfile creado:', profile._id.toString());

    sendVerificationEmail(normalizedEmail, name.trim(), emailToken)
      .then(() => console.log('8. Email enviado OK'))
      .catch((err) => console.error('8. Error enviando email:', err));

    console.log('9. Antes de generar JWT');
    const token = generateToken(user._id);
    console.log('10. JWT generado');

    const payload = {
      message: 'Cuenta creada. Revisá tu email para verificarla.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    };

    console.log('11. Antes de responder JSON');
    return res.status(201).json(payload);
  } catch (err) {
    console.error('REGISTER PROVIDER ERROR FULL:', err);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Login ────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email y contraseña son obligatorios' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Email o contraseña incorrectos' });
    if (user.status === 'blocked') return res.status(403).json({ message: 'Tu cuenta fue suspendida. Contactá al soporte.' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Email o contraseña incorrectos' });

    let profilePhoto = null;
    let plan = null;
    if (user.role === 'provider') {
      const profile = await ProviderProfile.findOne({ userId: user._id }).select('profilePhoto plan');
      profilePhoto = profile?.profilePhoto || null;
      plan = profile?.plan || 'free';
    }
    if (user.role === 'seeker') {
      const seekerP = await SeekerProfile.findOne({ userId: user._id }).select('profilePhoto');
      profilePhoto = seekerP?.profilePhoto || null;
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
        profilePhoto,
        plan: plan || null,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /me ──────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -emailVerificationToken');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    let profilePhoto = null;
    let plan = null;
    if (user.role === 'provider') {
      const profile = await ProviderProfile.findOne({ userId: user._id }).select('profilePhoto plan');
      profilePhoto = profile?.profilePhoto || null;
      plan = profile?.plan || 'free';
    }
    if (user.role === 'seeker') {
      const seekerP = await SeekerProfile.findOne({ userId: user._id }).select('profilePhoto');
      profilePhoto = seekerP?.profilePhoto || null;
    }

    res.json({ user: { ...user.toObject(), profilePhoto, plan } });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Verificar email ──────────────────────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token requerido' });

    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) return res.status(400).json({ message: 'Token inválido o expirado' });

    user.emailVerified = true;
    user.emailVerificationToken = null;
    await user.save();

    sendWelcomeEmail(user.email, user.name, user.role).catch(err => console.error('sendWelcomeEmail error:', err));

    res.json({ message: 'Email verificado correctamente' });
  } catch (err) {
    console.error('verifyEmail error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Reenviar verificación ────────────────────────────────────
const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.emailVerified) return res.status(400).json({ message: 'El email ya está verificado' });

    const emailToken = generateEmailToken();
    user.emailVerificationToken = emailToken;
    await user.save();

    sendVerificationEmail(user.email, user.name, emailToken).catch(err => console.error('resend error:', err));

    res.json({ message: 'Email de verificación reenviado' });
  } catch (err) {
    console.error('resendVerification error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Solicitar reset de contraseña ────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });

    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' });

    const resetToken = generateEmailToken();
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    sendPasswordResetEmail(user.email, user.name, resetToken).catch(err => console.error('sendPasswordReset error:', err));

    res.json({ message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Resetear contraseña ──────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token y contraseña son requeridos' });
    if (password.length < 8) return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ message: 'Token inválido o expirado' });

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Cambiar contraseña (usuario logueado) ────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Contraseña actual y nueva son requeridas' });
    if (newPassword.length < 8)
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    if (currentPassword === newPassword)
      return res.status(400).json({ message: 'La nueva contraseña debe ser diferente a la actual' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch)
      return res.status(401).json({ message: 'La contraseña actual es incorrecta' });

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
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
};