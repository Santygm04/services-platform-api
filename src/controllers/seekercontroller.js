const SeekerProfile = require('../models/seekerprofile');
const ProviderProfile = require('../models/providerprofile');
const User = require('../models/user');

// ── Helper: obtener o crear perfil automáticamente ────────
// Evita el error 404 para usuarios registrados antes de que existiera el modelo
const getOrCreateProfile = async (userId) => {
  let profile = await SeekerProfile.findOne({ userId });
  if (!profile) {
    profile = await SeekerProfile.create({ userId });
  }
  return profile;
};

// ── GET /api/seekers/me ────────────────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user._id);

    // Populate favorites por separado para no perder el documento recién creado
    await profile.populate('favorites', 'profession zone ratingAverage reviewsCount plan verified profilePhoto userId');

    res.json({ seeker: profile });
  } catch (error) {
    console.error('getMyProfile seeker error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── PATCH /api/seekers/me ──────────────────────────────────
const updateMyProfile = async (req, res) => {
  try {
    const { name, zone } = req.body;

    // Actualizar nombre en User
    if (name !== undefined) {
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 60) {
        return res.status(400).json({ message: 'El nombre debe tener entre 2 y 60 caracteres' });
      }
      await User.findByIdAndUpdate(req.user._id, { name: trimmed });
    }

    // Upsert: si no existe el perfil, crearlo al mismo tiempo que actualizarlo
    const updateFields = {};
    if (zone !== undefined) {
      if (zone.length > 80) {
        return res.status(400).json({ message: 'La zona no puede superar los 80 caracteres' });
      }
      updateFields.zone = zone.trim();
    }

    const profile = await SeekerProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    res.json({ message: 'Perfil actualizado', profile });
  } catch (error) {
    console.error('updateMyProfile seeker error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/seekers/me/favorites ──────────────────────────
const getFavorites = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user._id);
    await profile.populate('favorites', 'profession zone ratingAverage reviewsCount plan verified profilePhoto userId');

    res.json({ favorites: profile.favorites });
  } catch (error) {
    console.error('getFavorites error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/seekers/me/favorites/:providerId ─────────────
const addFavorite = async (req, res) => {
  try {
    const { providerId } = req.params;

    const providerExists = await ProviderProfile.findById(providerId);
    if (!providerExists) {
      return res.status(404).json({ message: 'Prestador no encontrado' });
    }

    // Upsert: crea el perfil si no existe
    const profile = await getOrCreateProfile(req.user._id);

    // Comparar como strings para evitar mismatch de tipos ObjectId
    const alreadyFav = profile.favorites.some(
      (fid) => fid.toString() === providerId.toString()
    );
    if (alreadyFav) {
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

// ── DELETE /api/seekers/me/favorites/:providerId ───────────
const removeFavorite = async (req, res) => {
  try {
    const { providerId } = req.params;

    const profile = await getOrCreateProfile(req.user._id);
    profile.favorites = profile.favorites.filter(
      (id) => id.toString() !== providerId.toString()
    );
    await profile.save();

    res.json({ message: 'Eliminado de favoritos' });
  } catch (error) {
    console.error('removeFavorite error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/seekers/me/contact-history ───────────────────
const getContactHistory = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user._id);
    await profile.populate('contactHistory.providerId', 'profession zone profilePhoto userId');

    res.json({ contactHistory: profile.contactHistory });
  } catch (error) {
    console.error('getContactHistory error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/seekers/me/contact/:providerId ───────────────
const registerContact = async (req, res) => {
  try {
    const { providerId } = req.params;

    const providerExists = await ProviderProfile.findById(providerId);
    if (!providerExists) {
      return res.status(404).json({ message: 'Prestador no encontrado' });
    }

    const profile = await getOrCreateProfile(req.user._id);
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