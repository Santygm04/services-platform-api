const ProviderProfile = require('../models/providerprofile');
const ServiceCategory = require('../models/servicecategory');

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

    if (keyword) {
      filter.$or = [
        { profession: { $regex: keyword, $options: 'i' } },
        { bio: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (zone) {
      filter.zone = { $regex: zone, $options: 'i' };
    }

    if (category) {
      filter.category = category;
    }

    if (minRating) {
      filter.ratingAverage = { $gte: parseFloat(minRating) };
    }

    if (verified === 'true') {
      filter.verified = true;
    }

    if (urgent === 'true') {
      filter.urgencyAvailable = true;
    }

    const sort = {
      plan: -1,
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

    // Límite Free: visitantes no autenticados ven solo 5 resultados
    // El frontend usa "limited: true" para mostrar el popup de registro
    const FREE_LIMIT = 5;
    const isLimited = !req.user;

    const visibleProviders = isLimited
      ? providers.slice(0, FREE_LIMIT)
      : providers;

    res.json({
      providers: visibleProviders,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
      limited: isLimited,
      freeLimit: isLimited ? FREE_LIMIT : null,
    });
  } catch (error) {
    console.error('searchProviders error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/search/featured ─────────────────────────────
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