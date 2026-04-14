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

const MAX_RECENT_SEARCHES = 10;
 
// ── GET /api/seekers/me/recent-searches ──────────────────
// Devuelve las últimas búsquedas del seeker (máx 10, ordenadas por más reciente).
const getRecentSearches = async (req, res) => {
  try {
    const profile = await SeekerProfile.findOne({ userId: req.user._id })
      .select('recentSearches');
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
 
    const sorted = (profile.recentSearches || [])
      .sort((a, b) => new Date(b.searchedAt) - new Date(a.searchedAt))
      .slice(0, MAX_RECENT_SEARCHES);
 
    res.json({ recentSearches: sorted });
  } catch (err) {
    console.error('getRecentSearches error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const addRecentSearch = async (req, res) => {
  try {
    const { keyword = '', zone = '' } = req.body;
 
    if (!keyword.trim() && !zone.trim()) {
      return res.status(400).json({ message: 'Debés enviar al menos keyword o zone' });
    }
 
    const profile = await SeekerProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
 
    const kw = keyword.trim().toLowerCase();
    const zn = zone.trim().toLowerCase();
 
    // Eliminar duplicados de la misma combinación
    profile.recentSearches = (profile.recentSearches || []).filter(s =>
      !(s.keyword.toLowerCase() === kw && s.zone.toLowerCase() === zn)
    );
 
    // Insertar al principio
    profile.recentSearches.unshift({
      keyword:    keyword.trim(),
      zone:       zone.trim(),
      searchedAt: new Date(),
    });
 
    // Recortar a máximo permitido
    if (profile.recentSearches.length > MAX_RECENT_SEARCHES) {
      profile.recentSearches = profile.recentSearches.slice(0, MAX_RECENT_SEARCHES);
    }
 
    await profile.save();
 
    res.json({ message: 'Búsqueda guardada', recentSearches: profile.recentSearches });
  } catch (err) {
    console.error('addRecentSearch error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
 
// ── DELETE /api/seekers/me/recent-searches ───────────────
// Borra todo el historial de búsquedas recientes.
const clearRecentSearches = async (req, res) => {
  try {
    const profile = await SeekerProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { recentSearches: [] } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
 
    res.json({ message: 'Historial de búsquedas eliminado', recentSearches: [] });
  } catch (err) {
    console.error('clearRecentSearches error:', err);
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
  getRecentSearches, 
  addRecentSearch, 
  clearRecentSearches
};