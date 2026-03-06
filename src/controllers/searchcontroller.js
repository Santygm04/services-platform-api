const ProviderProfile = require('../models/providerprofile');

// ── GET /api/search/providers ────────────────────────────
const searchProviders = async (req, res) => {
  try {
    const {
      keyword,
      zone,
      category,
      minRating,
      verified,
      urgent,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    // Filtro por palabra clave en profession o bio
    if (keyword) {
      filter.$or = [
        { profession: { $regex: keyword, $options: 'i' } },
        { bio: { $regex: keyword, $options: 'i' } },
      ];
    }

    // Filtro por zona
    if (zone) {
      filter.zone = { $regex: zone, $options: 'i' };
    }

    // Filtro por categoría/rubro
    if (category) {
      filter.category = category;
    }

    // Filtro por rating mínimo
    if (minRating) {
      filter.ratingAverage = { $gte: parseFloat(minRating) };
    }

    // Filtro por verificado
    if (verified === 'true') {
      filter.verified = true;
    }

    // Filtro por urgencias
    if (urgent === 'true') {
      filter.urgencyAvailable = true;
    }

    // Ordenamiento: Plus y verificados primero, luego por rating
    const sort = {
      plan: -1,        // 'plus' > 'free' alfabéticamente inverso
      verified: -1,
      ratingAverage: -1,
      reviewsCount: -1,
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const providers = await ProviderProfile.find(filter)
      .populate('userId', 'name')
      .populate('category', 'name slug')
      .select('-phone -viewsTracking -portfolio -links')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProviderProfile.countDocuments(filter);

    res.json({
      providers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('searchProviders error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/search/featured ─────────────────────────────
// Prestadores Plus verificados con mejor rating
const getFeatured = async (req, res) => {
  try {
    const providers = await ProviderProfile.find({
      plan: 'plus',
      verified: true,
    })
      .populate('userId', 'name')
      .populate('category', 'name slug')
      .select('-phone -viewsTracking')
      .sort({ ratingAverage: -1, reviewsCount: -1 })
      .limit(10);

    res.json({ providers });
  } catch (error) {
    console.error('getFeatured error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/search/urgent ───────────────────────────────
const getUrgent = async (req, res) => {
  try {
    const providers = await ProviderProfile.find({
      urgencyAvailable: true,
    })
      .populate('userId', 'name')
      .populate('category', 'name slug')
      .select('-phone -viewsTracking -portfolio -links')
      .sort({ plan: -1, ratingAverage: -1 })
      .limit(20);

    res.json({ providers });
  } catch (error) {
    console.error('getUrgent error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  searchProviders,
  getFeatured,
  getUrgent,
};