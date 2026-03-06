const SeekerProfile = require('../models/seekerprofile');
const ProviderProfile = require('../models/providerprofile');

// ── GET /api/seekers/me ──────────────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const profile = await SeekerProfile.findOne({ userId: req.user._id })
      .populate('favorites', 'profession zone ratingAverage reviewsCount plan verified profilePhoto');

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    res.json({ profile });
  } catch (error) {
    console.error('getMyProfile seeker error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── PATCH /api/seekers/me ────────────────────────────────
const updateMyProfile = async (req, res) => {
  try {
    // El buscador no tiene campos editables en el perfil por ahora
    // Se expande en fases posteriores (notificaciones, etc)
    res.json({ message: 'Perfil actualizado' });
  } catch (error) {
    console.error('updateMyProfile seeker error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/seekers/me/favorites ────────────────────────
const getFavorites = async (req, res) => {
  try {
    const profile = await SeekerProfile.findOne({ userId: req.user._id })
      .populate('favorites', 'profession zone ratingAverage reviewsCount plan verified profilePhoto userId');

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    res.json({ favorites: profile.favorites });
  } catch (error) {
    console.error('getFavorites error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/seekers/me/favorites/:providerId ───────────
const addFavorite = async (req, res) => {
  try {
    const { providerId } = req.params;

    const providerExists = await ProviderProfile.findById(providerId);
    if (!providerExists) {
      return res.status(404).json({ message: 'Prestador no encontrado' });
    }

    const profile = await SeekerProfile.findOne({ userId: req.user._id });

    if (profile.favorites.includes(providerId)) {
      return res.status(400).json({ message: 'Ya está en tus favoritos' });
    }

    profile.favorites.push(providerId);
    await profile.save();

    res.json({ message: 'Agregado a favoritos' });
  } catch (error) {
    console.error('addFavorite error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── DELETE /api/seekers/me/favorites/:providerId ─────────
const removeFavorite = async (req, res) => {
  try {
    const { providerId } = req.params;

    const profile = await SeekerProfile.findOne({ userId: req.user._id });
    profile.favorites = profile.favorites.filter(
      (id) => id.toString() !== providerId
    );
    await profile.save();

    res.json({ message: 'Eliminado de favoritos' });
  } catch (error) {
    console.error('removeFavorite error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/seekers/me/contact-history ─────────────────
const getContactHistory = async (req, res) => {
  try {
    const profile = await SeekerProfile.findOne({ userId: req.user._id })
      .populate('contactHistory.providerId', 'profession zone profilePhoto userId');

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    res.json({ contactHistory: profile.contactHistory });
  } catch (error) {
    console.error('getContactHistory error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/seekers/me/contact/:providerId ─────────────
// Registra que el buscador contactó a un prestador
const registerContact = async (req, res) => {
  try {
    const { providerId } = req.params;

    const providerExists = await ProviderProfile.findById(providerId);
    if (!providerExists) {
      return res.status(404).json({ message: 'Prestador no encontrado' });
    }

    const profile = await SeekerProfile.findOne({ userId: req.user._id });

    profile.contactHistory.push({ providerId });
    await profile.save();

    res.json({ message: 'Contacto registrado' });
  } catch (error) {
    console.error('registerContact error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getFavorites,
  addFavorite,
  removeFavorite,
  getContactHistory,
  registerContact,
};