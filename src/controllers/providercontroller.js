const ProviderProfile = require('../models/providerProfile');

const DAILY_VIEW_LIMIT = 5;

// ── GET /api/providers/me ────────────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    res.json({ profile });
  } catch (error) {
    console.error('getMyProfile error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── PATCH /api/providers/me ──────────────────────────────
const updateMyProfile = async (req, res) => {
  try {
    const allowedFields = ['profession', 'zone', 'bio', 'phone', 'urgencyAvailable'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const profile = await ProviderProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil actualizado', profile });
  } catch (error) {
    console.error('updateMyProfile error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/providers/:id (perfil público) ──────────────
const getPublicProfile = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id).populate(
      'userId',
      'name emailVerified'
    );

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    // Registrar visualización si el visitante no es el dueño del perfil
    const viewerId = req.user?._id?.toString();
    const ownerId = profile.userId._id.toString();

    if (viewerId !== ownerId) {
      await registerView(profile);
    }

    // Construir respuesta según si hay usuario autenticado o no
    const isAuthenticated = !!req.user;
    const responseProfile = buildPublicProfile(profile, isAuthenticated);

    res.json({ profile: responseProfile });
  } catch (error) {
    console.error('getPublicProfile error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/providers/:id/view ─────────────────────────
const trackView = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    await registerView(profile);
    res.json({ message: 'Visualización registrada' });
  } catch (error) {
    console.error('trackView error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/providers/me/stats ──────────────────────────
const getMyStats = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    const isPlus = profile.plan === 'plus';
    const today = isToday(profile.viewsTracking?.date);

    res.json({
      plan: profile.plan,
      ratingAverage: profile.ratingAverage,
      reviewsCount: profile.reviewsCount,
      viewsToday: today ? profile.viewsTracking.count : 0,
      dailyLimit: isPlus ? null : DAILY_VIEW_LIMIT,
      limitReached: !isPlus && today && profile.viewsTracking.count >= DAILY_VIEW_LIMIT,
    });
  } catch (error) {
    console.error('getMyStats error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/providers ───────────────────────────────────
const getAllProviders = async (req, res) => {
  try {
    const providers = await ProviderProfile.find()
      .populate('userId', 'name')
      .select('profession zone ratingAverage reviewsCount plan verified urgencyAvailable');
    res.json({ providers });
  } catch (error) {
    console.error('getAllProviders error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── HELPERS ──────────────────────────────────────────────

// Lógica del contador diario de visualizaciones
const registerView = async (profile) => {
  if (profile.plan === 'plus') {
    // Plus: solo incrementar sin límite
    profile.viewsTracking.count = (profile.viewsTracking.count || 0) + 1;
    profile.viewsTracking.date = new Date();
  } else {
    // Free: resetear si es un día nuevo, o incrementar si no alcanzó el límite
    const today = isToday(profile.viewsTracking?.date);
    if (!today) {
      profile.viewsTracking = { date: new Date(), count: 1 };
    } else if (profile.viewsTracking.count < DAILY_VIEW_LIMIT) {
      profile.viewsTracking.count += 1;
    }
    // Si ya alcanzó el límite, no se incrementa
  }
  await profile.save();
};

// Verifica si una fecha es de hoy
const isToday = (date) => {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

// Filtra los campos del perfil según si el visitante está autenticado
const buildPublicProfile = (profile, isAuthenticated) => {
  const base = {
    _id: profile._id,
    userId: profile.userId,
    profession: profile.profession,
    zone: profile.zone,
    bio: profile.bio,
    profilePhoto: profile.profilePhoto,
    plan: profile.plan,
    verified: profile.verified,
    urgencyAvailable: profile.urgencyAvailable,
    ratingAverage: profile.ratingAverage,
    reviewsCount: profile.reviewsCount,
  };

  if (isAuthenticated) {
    // Usuario registrado ve datos de contacto
    base.phone = profile.phone;
  }

  if (profile.plan === 'plus') {
    // Plus: mostrar portfolio y links siempre
    base.portfolio = profile.portfolio;
    base.links = profile.links;
  }

  return base;
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  trackView,
  getMyStats,
  getAllProviders,
};