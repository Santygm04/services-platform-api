const User            = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const SeekerProfile   = require('../models/SeekerProfile');
const Notification    = require('../models/notification');
const jwt             = require('jsonwebtoken');
const crypto          = require('crypto');
const {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPlanUpgradeEmail,   // agregar a emailservice.js si no existe
} = require('../services/emailservice');

// ── Helpers ───────────────────────────────────────────────
const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const generateEmailToken = () => crypto.randomBytes(32).toString('hex');

// ── Helper: notificar providers de la zona ────────────────
const notifyProvidersInZone = async (seekerName, seekerZone) => {
  if (!seekerZone) return;
  try {
    const zoneWords  = seekerZone.toLowerCase().trim().split(/[\s,]+/).filter(w => w.length >= 2);
    if (!zoneWords.length) return;

    const zoneRegex  = new RegExp(zoneWords.join('|'), 'i');
    const providers  = await ProviderProfile.find({ zone: { $regex: zoneRegex } })
      .select('userId zone')
      .limit(50);

    if (!providers.length) return;

    const notifications = providers.map(p => ({
      userId: p.userId,
      type:   'new_seeker_in_zone',
      title:  '🔍 Nuevo buscador en tu zona',
      body:   `${seekerName} se registró en ${seekerZone}. ¡Puede necesitar tus servicios!`,
      meta:   { seekerZone },
    }));

    await Notification.insertMany(notifications);
  } catch (err) {
    console.error('notifyProvidersInZone error:', err);
  }
};

// ── Helper: armar respuesta de usuario ────────────────────
const buildUserResponse = async (user) => {
  let profilePhoto = null;
  let plan         = null;

  if (user.role === 'provider') {
    const profile  = await ProviderProfile.findOne({ userId: user._id }).select('profilePhoto plan');
    profilePhoto   = profile?.profilePhoto || null;
    plan           = profile?.plan || 'free';
  }
  if (user.role === 'seeker') {
    const seekerP  = await SeekerProfile.findOne({ userId: user._id }).select('profilePhoto');
    profilePhoto   = seekerP?.profilePhoto || null;
  }

  return {
    id:            user._id,
    name:          user.name,
    email:         user.email,
    role:          user.role,
    emailVerified: user.emailVerified,
    status:        user.status,
    profilePhoto,
    plan:          plan || null,
  };
};

// ════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════

// GET /api/auth/admin-check
const adminCheck = async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'admin' }).select('_id');
    res.json({ adminExists: !!adminExists });
  } catch (err) {
    console.error('adminCheck error:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// POST /api/auth/admin-setup — primer admin (solo si no hay ninguno)
const adminSetup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    if (password.length < 8)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });

    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists)
      return res.status(403).json({ message: 'Ya existe un administrador. Usá el código de invitación.' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });

    const user  = await User.create({ name, email, password, role: 'admin', emailVerified: true });
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

// POST /api/auth/register-admin — con código de invitación
const registerAdmin = async (req, res) => {
  try {
    const { name, email, password, inviteCode } = req.body;
    if (!name || !email || !password || !inviteCode)
      return res.status(400).json({ message: 'Todos los campos son obligatorios (incluido el código de invitación)' });
    if (password.length < 8)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });

    const validCode = process.env.ADMIN_INVITE_CODE;
    if (!validCode)
      return res.status(503).json({ message: 'El registro de administradores no está habilitado.' });
    if (inviteCode.trim() !== validCode.trim())
      return res.status(403).json({ message: 'Código de invitación inválido' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });

    const user  = await User.create({ name, email, password, role: 'admin', emailVerified: true });
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

// ════════════════════════════════════════════════════════════
//  REGISTRO
// ════════════════════════════════════════════════════════════

// POST /api/auth/register-seeker
const registerSeeker = async (req, res) => {
  try {
    const { name, email, password, zone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ya existe una cuenta con ese email' });

    const emailToken = generateEmailToken();
    const user       = await User.create({ name, email, password, role: 'seeker', emailVerificationToken: emailToken });
    await SeekerProfile.create({ userId: user._id, zone: zone?.trim() || '' });

      console.log('=== INTENTO DE EMAIL (seeker) ===');
      console.log('EMAIL_USER:', process.env.EMAIL_USER);
      console.log('EMAIL_PASS existe:', !!process.env.EMAIL_PASS);
      console.log('Destinatario:', email);

    if (zone?.trim()) {
      notifyProvidersInZone(name, zone.trim()).catch(() => {});
    }

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Cuenta creada. Revisá tu email para verificarla.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
    });

    // Email DESPUÉS de responder para no bloquear el request
    sendVerificationEmail(email, name, emailToken)
      .then(() => console.log('✅ Email enviado a', email))
      .catch(err => console.error('❌ Email falló:', err.message));
  } catch (err) {
    console.error('registerSeeker error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// POST /api/auth/register-provider
// Soporta código de referido opcional (?ref=ZS-XXXXXX o body.referralCode)
const registerProvider = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });

    const normalizedEmail = email.trim().toLowerCase();
    const existing        = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: 'Ya existe una cuenta con ese email' });

    const emailToken = generateEmailToken();
    const user       = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'provider',
      emailVerificationToken: emailToken,
    });

    // Buscar quién refirió (si hay código)
    let referredByUserId = null;
    if (referralCode?.trim()) {
      const referrerProfile = await ProviderProfile.findOne({ referralCode: referralCode.trim() });
      if (referrerProfile) {
        referredByUserId = referrerProfile.userId;
        // Sumar créditos al referidor ($500 ARS por referido)
        await ProviderProfile.findByIdAndUpdate(referrerProfile._id, {
          $inc: { referralCredits: 500 },
        });
      }
    }

    await ProviderProfile.create({
      userId:      user._id,
      referredBy:  referredByUserId,
    });

      console.log('=== INTENTO DE EMAIL ===');
      console.log('EMAIL_USER:', process.env.EMAIL_USER);
      console.log('EMAIL_PASS existe:', !!process.env.EMAIL_PASS);
      console.log('Destinatario:', normalizedEmail);

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Cuenta creada. Revisá tu email para verificarla.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
    });

    sendVerificationEmail(normalizedEmail, name.trim(), emailToken)
      .then(() => console.log('✅ Email enviado a', normalizedEmail))
      .catch(err => console.error('❌ Email falló:', err.message));
  } catch (err) {
    console.error('registerProvider error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
//  LOGIN + GOOGLE OAUTH
// ════════════════════════════════════════════════════════════

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email y contraseña son obligatorios' });

    const user = await User.findOne({ email });
    if (!user)   return res.status(401).json({ message: 'Email o contraseña incorrectos' });
    if (user.status === 'blocked')
      return res.status(403).json({ message: 'Tu cuenta fue suspendida. Contactá al soporte.' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
    if (user.googleId) {
      return res.status(401).json({ message: 'Esta cuenta fue creada con Google. Usá "Continuar con Google" para ingresar.' });
      }
      return res.status(401).json({ message: 'Email o contraseña incorrectos' });
    }

    const token    = generateToken(user._id);
    const userData = await buildUserResponse(user);
    res.json({ token, user: userData });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Google OAuth ──────────────────────────────────────────
// GET /api/auth/google
// Inicia el flujo OAuth con Google. El frontend redirige a esta URL.
// req.query.role → 'provider' | 'seeker' (para saber qué perfil crear)
// Se pasa como state para recuperarlo en el callback.
const googleAuth = (req, res) => {
  const role  = req.query.role || 'seeker';
  const ref   = req.query.ref  || '';  // código de referido opcional

  // Construir la URL de Google OAuth manualmente
  // (sin Passport, para mantener el código simple y sin deps extra)
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${process.env.BACKEND_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    state:         JSON.stringify({ role, ref }),
    access_type:   'offline',
    prompt:        'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

// GET /api/auth/google/callback
// Google redirige aquí con ?code=...&state=...
const googleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error || !code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_cancelled`);
    }

    // Parsear state
    let role = 'seeker';
    let ref  = '';
    try {
      const parsed = JSON.parse(state || '{}');
      role = parsed.role || 'seeker';
      ref  = parsed.ref  || '';
    } catch (_) {}

    // 1. Intercambiar code por access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${process.env.BACKEND_URL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Google token error:', tokenData);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_token`);
    }

    // 2. Obtener datos del usuario de Google
    const userInfoRes  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser   = await userInfoRes.json();

    if (!googleUser.email) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_no_email`);
    }

    // 3. Buscar o crear el usuario
    let user = await User.findOne({ email: googleUser.email });

    if (!user) {
      // Nuevo usuario via Google
      user = await User.create({
        name:          googleUser.name || googleUser.email.split('@')[0],
        email:         googleUser.email,
        password:      crypto.randomBytes(20).toString('hex'), // contraseña aleatoria (no se usa)
        role,
        emailVerified: true,  // Google ya verificó el email
        googleId:      googleUser.sub,
      });

      // Crear perfil según rol
      if (role === 'provider') {
        // Referido opcional
        let referredByUserId = null;
        if (ref?.trim()) {
          const referrerProfile = await ProviderProfile.findOne({ referralCode: ref.trim() });
          if (referrerProfile) {
            referredByUserId = referrerProfile.userId;
            await ProviderProfile.findByIdAndUpdate(referrerProfile._id, {
              $inc: { referralCredits: 500 },
            });
          }
        }
        await ProviderProfile.create({ userId: user._id, referredBy: referredByUserId });
      } else {
        await SeekerProfile.create({ userId: user._id });
      }

      // Email de bienvenida
      sendWelcomeEmail(user.email, user.name, role).catch(() => {});

    } else {
      // Usuario existente — actualizar googleId si no tenía
      if (!user.googleId) {
        user.googleId     = googleUser.sub;
        user.emailVerified = true;
        await user.save();
      }
      if (user.status === 'blocked') {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=blocked`);
      }
    }

    // 4. Generar JWT y redirigir al frontend
    const token = generateToken(user._id);

    // Redirigir con token en query (el frontend lo guarda en localStorage)
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/google-success?token=${token}&role=${user.role}`
    );
  } catch (err) {
    console.error('googleCallback error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=google_error`);
  }
};

// ════════════════════════════════════════════════════════════
//  PLAN UPGRADE (Plus / Premium)
// ════════════════════════════════════════════════════════════

// PATCH /api/auth/upgrade-plan
// Body: { plan: 'plus' | 'premium', months: 1 }
// En producción esto lo dispara el webhook de MercadoPago.
// También sirve para que el admin actualice el plan manualmente.
const upgradePlan = async (req, res) => {
  try {
    const { plan, months = 1 } = req.body;

    if (!['plus', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Plan inválido. Opciones: plus, premium' });
    }
    if (months < 1 || months > 12) {
      return res.status(400).json({ message: 'Meses inválidos (1-12)' });
    }

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil de prestador no encontrado' });

    // Si ya tiene un plan activo, extender desde la fecha de expiración actual
    const now     = new Date();
    const baseDate = (profile.planExpiresAt && profile.planExpiresAt > now)
      ? profile.planExpiresAt
      : now;

    const planExpiresAt = new Date(baseDate);
    planExpiresAt.setMonth(planExpiresAt.getMonth() + months);

    profile.plan          = plan;
    profile.planExpiresAt = planExpiresAt;
    await profile.save(); // pre-save sincroniza badges automáticamente

    // Email de upgrade
    const user = await User.findById(req.user._id).select('email name');
    if (user?.email) {
      sendPlanUpgradeEmail?.(user.email, user.name, plan, planExpiresAt)
        .catch(err => console.error('sendPlanUpgradeEmail error:', err));
    }

    res.json({
      message:      `Plan actualizado a ${plan.toUpperCase()}`,
      plan:         profile.plan,
      planExpiresAt: profile.planExpiresAt,
      badges:       profile.badges,
    });
  } catch (err) {
    console.error('upgradePlan error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ADMIN: PATCH /api/auth/admin/upgrade-plan/:userId
// Admin puede actualizar el plan de cualquier prestador
const adminUpgradePlan = async (req, res) => {
  try {
    const { userId }         = req.params;
    const { plan, months = 1 } = req.body;

    if (!['free', 'plus', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Plan inválido. Opciones: free, plus, premium' });
    }

    const profile = await ProviderProfile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });

    if (plan === 'free') {
      profile.plan          = 'free';
      profile.planExpiresAt = null;
    } else {
      const now      = new Date();
      const baseDate = (profile.planExpiresAt && profile.planExpiresAt > now)
        ? profile.planExpiresAt
        : now;

      const planExpiresAt = new Date(baseDate);
      planExpiresAt.setMonth(planExpiresAt.getMonth() + months);

      profile.plan          = plan;
      profile.planExpiresAt = planExpiresAt;
    }

    await profile.save();

    const user = await User.findById(userId).select('email name');
    if (user?.email && plan !== 'free') {
      sendPlanUpgradeEmail?.(user.email, user.name, plan, profile.planExpiresAt)
        .catch(() => {});
    }

    res.json({
      message:      `Plan de ${user?.name || userId} actualizado a ${plan.toUpperCase()}`,
      plan:         profile.plan,
      planExpiresAt: profile.planExpiresAt,
      badges:       profile.badges,
    });
  } catch (err) {
    console.error('adminUpgradePlan error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
//  EMAIL
// ════════════════════════════════════════════════════════════

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -emailVerificationToken');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    const userData = await buildUserResponse(user);
    res.json({ user: { ...user.toObject(), ...userData } });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token requerido' });

    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) return res.status(400).json({ message: 'Token inválido o expirado' });

    user.emailVerified         = true;
    user.emailVerificationToken = null;
    await user.save();

    sendWelcomeEmail(user.email, user.name, user.role).catch(err => console.error('sendWelcomeEmail error:', err));
    res.json({ message: 'Email verificado correctamente' });
  } catch (err) {
    console.error('verifyEmail error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.emailVerified) return res.status(400).json({ message: 'El email ya está verificado' });

    const emailToken          = generateEmailToken();
    user.emailVerificationToken = emailToken;
    await user.save();

    sendVerificationEmail(user.email, user.name, emailToken).catch(err => console.error('resend error:', err));
    res.json({ message: 'Email de verificación reenviado' });
  } catch (err) {
    console.error('resendVerification error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });

    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' });

    const resetToken            = generateEmailToken();
    user.passwordResetToken     = resetToken;
    user.passwordResetExpires   = Date.now() + 60 * 60 * 1000;
    await user.save();

    sendPasswordResetEmail(user.email, user.name, resetToken).catch(err => console.error('sendPasswordReset error:', err));
    res.json({ message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token y contraseña son requeridos' });
    if (password.length < 8)  return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });

    const user = await User.findOne({
      passwordResetToken:   token,
      passwordResetExpires: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ message: 'Token inválido o expirado' });

    user.password           = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

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
    if (!isMatch) return res.status(401).json({ message: 'La contraseña actual es incorrecta' });

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  // Admin
  adminCheck,
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
};