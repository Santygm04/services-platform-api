const mongoose = require('mongoose');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceCategory = require('../models/servicecategory');

// ── Distancia de Levenshtein (tolerancia a errores tipográficos) ──
const levenshtein = (a, b) => {
  a = a.toLowerCase(); b = b.toLowerCase();
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

// Tolerancia según largo de palabra: cortas toleran menos, largas toleran más
const maxDistanceFor = (len) => (len <= 4 ? 1 : len <= 8 ? 2 : 3);

// Busca el término conocido más parecido a la palabra escrita
const findClosestMatch = (word, knownWords) => {
  let best = null;
  let bestDist = Infinity;
  for (const known of knownWords) {
    const dist = levenshtein(word, known);
    if (dist < bestDist) { bestDist = dist; best = known; }
  }
  if (best && bestDist > 0 && bestDist <= maxDistanceFor(word.length)) return best;
  return null;
};

// ── Cache de términos conocidos (profesiones + categorías + subcategorías) ──
let knownTermsCache = null;
let knownTermsCacheTime = 0;
const getKnownSearchTerms = async () => {
  const now = Date.now();
  if (knownTermsCache && now - knownTermsCacheTime < 10 * 60 * 1000) return knownTermsCache;

  const professions = await ProviderProfile.distinct('profession', { profession: { $nin: [null, ''] } });
  const categories  = await ServiceCategory.find({ active: true }).select('name subcategories.name').lean();
  const catNames    = categories.map(c => c.name);
  const subNames    = categories.flatMap(c => (c.subcategories || []).map(s => s.name));

  knownTermsCache = [...new Set([...professions, ...catNames, ...subNames])];
  knownTermsCacheTime = now;
  return knownTermsCache;
};

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

    const asString = (val) => (typeof val === 'string' ? val : undefined);
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const safeKeyword    = asString(keyword);
    const safeZone       = asString(zone);
    const safeCategory   = asString(category);
    const safeSubcategory = asString(subcategory);

  const filter = {
  profession: { $exists: true, $nin: [null, '', undefined] },
  };

    if (safeKeyword) {
      const knownTerms = await getKnownSearchTerms();
      const words = safeKeyword.split(/\s+/).filter(Boolean);

      const expandedTerms = new Set([safeKeyword]);
      for (const w of words) {
        if (w.length >= 3) {
          const match = findClosestMatch(w, knownTerms);
          if (match) expandedTerms.add(match);
        }
      }

      const patterns = [...expandedTerms].map(escapeRegex);
      filter.$or = patterns.flatMap(p => [
        { profession: { $regex: p, $options: 'i' } },
        { bio: { $regex: p, $options: 'i' } },
      ]);
    }

    if (safeZone) {
      filter.zone = { $regex: escapeRegex(safeZone), $options: 'i' };
    }

    if (safeCategory && mongoose.Types.ObjectId.isValid(safeCategory)) {
      filter.category = safeCategory;
    }

    // Subcategoría: ahora se guarda como slug exacto en el perfil (ProviderProfile.subcategory)
    // en vez de buscar por texto libre en profession/bio. Esto elimina los falsos "0 resultados".
    if (safeSubcategory) {
      filter.subcategory = safeSubcategory;
      // Si no vino category explícita, la inferimos desde la subcategoría elegida
      if (!filter.category) {
        const cat = await ServiceCategory.findOne({ 'subcategories.slug': safeSubcategory }).select('_id');
        if (cat) filter.category = cat._id;
      }
    }

    const parsedMinRating = parseFloat(minRating);
    if (minRating && !Number.isNaN(parsedMinRating) && parsedMinRating >= 0 && parsedMinRating <= 5) {
      filter.ratingAverage = { $gte: parsedMinRating };
    }

    if (verified === 'true') {
      filter.verified = true;
    }

    if (urgent === 'true') {
      filter.urgencyAvailable = true;
    }

     if (active === 'true') {
      filter.activeStatus = true;
    }
    // Si no se filtra por active, traemos todos (activos e inactivos)

    // Traer todos para ordenar por plan correctamente antes de paginar
    const allProviders = await ProviderProfile.find(filter)
      .populate('userId', 'name emailVerified status')
      .populate('category', 'name slug')
      .select('-phone -viewsTracking -portfolio -links ');

    const validProviders = allProviders.filter(p =>
      p.userId &&
      p.userId.emailVerified === true &&
      p.userId.status !== 'blocked' &&
      p.userId.status !== 'inactive'
    );

    const total = validProviders.length;

    // ── Ordenar por plan con rotación cada 30 min ──────────
    const rotationSlot = Math.floor(Date.now() / (30 * 60 * 1000));

    const premiums = validProviders.filter(p => p.plan === 'premium');
    const plus     = validProviders.filter(p => p.plan === 'plus');
    const free = validProviders.filter(p => p.plan !== 'premium' && p.plan !== 'plus');
    const inactiveProviders = validProviders.filter(p => p.activeStatus === false);
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
  const sortedInactive = validProviders.filter(p => p.activeStatus === false);
  const sorted = [...sortedActive, ...sortedInactive];

    const pageNum   = Math.max(1, parseInt(page) || 1);
    const limitNum  = Math.min(50, Math.max(1, parseInt(limit) || 20));
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