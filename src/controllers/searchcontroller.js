const ProviderProfile = require('../models/providerprofile');
const ServiceCategory = require('../models/servicecategory');

// ── GET /api/search/providers ────────────────────────────
const searchProviders = async (req, res) => {
  try {
    const {
      keyword,
      zone,
      category,
      subcategory,
      minRating,
      verified,
      urgent,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {
      profession: { $exists: true, $nin: [null, '', undefined] },
    };

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

    // Subcategoría: busca prestadores que tengan la profesión matcheando el nombre de subcategoría
    if (subcategory) {
      // Buscar la subcategoría en las categorías
      const cat = await ServiceCategory.findOne({ 'subcategories.slug': subcategory });
      if (cat) {
        const sub = cat.subcategories.find(s => s.slug === subcategory);
        if (sub) {
          // Filtrar por nombre de subcategoría en profession o bio
          const subFilter = { $regex: sub.name, $options: 'i' };
          if (filter.$or) {
            // Ya hay keyword, combinar con AND
            filter.$and = [
              { $or: filter.$or },
              { $or: [{ profession: subFilter }, { bio: subFilter }] },
            ];
            delete filter.$or;
          } else {
            filter.$or = [{ profession: subFilter }, { bio: subFilter }];
          }
          // También filtrar por la categoría padre
          filter.category = cat._id;
        }
      }
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
      profession: { $exists: true, $nin: [null, '', undefined] },
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

// ── GET /api/search/by-slug/:slug ────────────────────────
// Para URLs semánticas: /electricista-belgrano-abc123
const getBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const profile = await ProviderProfile.findOne({ slug })
      .populate('userId', 'name emailVerified')
      .populate('category', 'name slug');

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    // Devolver el ID para que el frontend redirija a /providers/:id
    res.json({ profileId: profile._id, slug: profile.slug, profile });
  } catch (error) {
    console.error('getBySlug error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/search/categories ───────────────────────────
// Devuelve categorías con subcategorías para el filtro
const getCategories = async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ active: true })
      .select('name slug icon subcategories')
      .sort({ name: 1 });

    res.json({ categories });
  } catch (error) {
    console.error('getCategories error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  searchProviders,
  getFeatured,
  getUrgent,
  getBySlug,
  getCategories,
};