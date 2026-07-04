const ProviderProfile = require('../models/ProviderProfile');
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
      active,
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

    // Subcategoría: ahora se guarda como slug exacto en el perfil (ProviderProfile.subcategory)
    // en vez de buscar por texto libre en profession/bio. Esto elimina los falsos "0 resultados".
    if (subcategory) {
      filter.subcategory = subcategory;
      // Si no vino category explícita, la inferimos desde la subcategoría elegida
      if (!filter.category) {
        const cat = await ServiceCategory.findOne({ 'subcategories.slug': subcategory }).select('_id');
        if (cat) filter.category = cat._id;
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

     if (active === 'true') {
      filter.activeStatus = true;
    } else {
      filter.activeStatus = { $ne: false };
    }

    // Traer todos para ordenar por plan correctamente antes de paginar
    const allProviders = await ProviderProfile.find(filter)
      .populate('userId', 'name')
      .populate('category', 'name slug')
      .select('-phone -viewsTracking -portfolio -links ');

    const total = await ProviderProfile.countDocuments(filter);

    // ── Ordenar por plan con rotación cada 30 min ──────────
    const rotationSlot = Math.floor(Date.now() / (30 * 60 * 1000));

    const premiums = allProviders.filter(p => p.plan === 'premium');
    const plus     = allProviders.filter(p => p.plan === 'plus');
    const free = allProviders.filter(p => p.plan !== 'premium' && p.plan !== 'plus');
    const activeProviders   = [...premiums.filter(p => p.activeStatus !== false), ...plus.filter(p => p.activeStatus !== false), ...free.filter(p => p.activeStatus !== false)];
    const inactiveProviders = allProviders.filter(p => p.activeStatus === false);
    const rotate = (arr, slot) => {
      if (arr.length <= 1) return arr;
      const offset = slot % arr.length;
      return [...arr.slice(offset), ...arr.slice(0, offset)];
    };

    const sortedActive = [
  ...rotate(premiums.filter(p => p.activeStatus !== false), rotationSlot),
  ...rotate(plus.filter(p => p.activeStatus !== false), rotationSlot),
  ...free.filter(p => p.activeStatus !== false).sort((a, b) =>
    (b.verified - a.verified) || (b.ratingAverage - a.ratingAverage) || (b.reviewsCount - a.reviewsCount)
  ),
  ];
  const sortedInactive = allProviders.filter(p => p.activeStatus === false);
  const sorted = [...sortedActive, ...sortedInactive];

    const pageNum   = parseInt(page);
    const limitNum  = parseInt(limit);
    const skip      = (pageNum - 1) * limitNum;

    const FREE_LIMIT   = 5;
    const isLimited    = !req.user;
    const sourceList   = isLimited ? sorted.slice(0, FREE_LIMIT) : sorted;
    const paginated    = sourceList.slice(skip, skip + limitNum);
    const effectiveTotal = isLimited ? Math.min(total, FREE_LIMIT) : total;

    res.json({
      providers: paginated,
      pagination: {
        total:   effectiveTotal,
        page:    pageNum,
        pages:   Math.ceil(effectiveTotal / limitNum),
      },
      limited:   isLimited,
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
      plan: { $in: ['plus', 'premium'] },
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
const mongoose = require('mongoose');

const getBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    let profile = await ProviderProfile.findOne({ slug })
      .populate('userId', 'name emailVerified')
      .populate('category', 'name slug');

    // Fallback: si no es un slug válido, puede ser un _id (perfil sin slug generado)
    if (!profile && mongoose.Types.ObjectId.isValid(slug)) {
      profile = await ProviderProfile.findById(slug)
        .populate('userId', 'name emailVerified')
        .populate('category', 'name slug');
    }

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