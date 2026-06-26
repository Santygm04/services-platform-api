const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const SeekerProfile = require('../models/SeekerProfile');
const Review = require('../models/review');
const BannerAd = require('../models/bannerad');
const Verification = require('../models/verification');

// ── Precios por posición (ARS/semana) — espejo de bannercontroller ──
const SLOT_PRICES = {
  sidebar_left:  2999,
  sidebar_right: 2999,
  home_sidebar:  3999,
  mobile:        1999,
  featured:      5999,
  sidebar:       2999, // legacy
};

const POSITION_LABELS = {
  sidebar_left:  'Sidebar Izquierdo (Búsqueda)',
  sidebar_right: 'Sidebar Derecho (Búsqueda)',
  home_sidebar:  'Sidebar Home',
  mobile:        'Banner Mobile',
  featured:      'Banner Destacado Home (Top)',
  sidebar:       'Sidebar (Legacy)',
};

// ── GET /api/admin/metrics ───────────────────────────────
const getMetrics = async (req, res) => {
  try {
    const periodMap = { '1m': 30, '3m': 90, '6m': 180, 'all': null };
    const periodDays = periodMap[req.query.period] ?? null;
    const periodFilter = periodDays ? { createdAt: { $gte: new Date(Date.now() - periodDays * 86400000) } } : {};

    const [
      totalUsers, totalProviders, totalSeekers, totalReviews,
      plusProviders, verifiedProviders, blockedUsers, inactiveUsers,
    ] = await Promise.all([
      User.countDocuments(periodFilter),
      User.countDocuments({ role: { $in: ['provider', 'both'] }, ...periodFilter }),
      User.countDocuments({ role: { $in: ['seeker', 'both'] }, ...periodFilter }),
      Review.countDocuments({ hidden: false, ...periodFilter }),
      ProviderProfile.countDocuments({ plan: { $in: ['plus', 'premium'] } }),
      ProviderProfile.countDocuments({ verified: true }),
      User.countDocuments({ status: 'blocked' }),
      User.countDocuments({ status: 'inactive' }),
    ]);

    const sevenDaysAgo    = new Date(Date.now() - 7  * 86400000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
    const newUsersWeek    = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    const newUsersPrevWeek = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 14 * 86400000), $lt: sevenDaysAgo },
    });
    const weekTrend = newUsersWeek - newUsersPrevWeek;

    const regAgg = await User.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, role: '$role' }, count: { $sum: 1 } } },
      { $sort: { '_id.date': 1 } },
    ]);
    const dailyMap = {};
    for (let i = 13; i >= 0; i--) {
      const d   = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }), providers: 0, seekers: 0, total: 0 };
    }
    regAgg.forEach(({ _id, count }) => {
      if (!dailyMap[_id.date]) return;
      if (_id.role === 'provider') dailyMap[_id.date].providers += count;
      else if (_id.role === 'seeker') dailyMap[_id.date].seekers += count;
      dailyMap[_id.date].total += count;
    });

    const ratingAgg = await Review.aggregate([
      { $match: { hidden: false } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const ratingsData = [1,2,3,4,5].map(r => ({
      rating: `${r}★`, cantidad: ratingAgg.find(x => x._id === r)?.count || 0,
    }));

    const rolesData = [
      { name: 'Buscadores',              value: totalSeekers,                  color: '#8B5CF6' },
      { name: 'Prestadores Free',        value: totalProviders - plusProviders, color: '#2563C4' },
      { name: 'Prestadores Plus/Premium',value: plusProviders,                  color: '#D97706' },
    ];

    const topProviders = await ProviderProfile.find({ reviewsCount: { $gt: 0 } })
      .sort({ ratingAverage: -1, reviewsCount: -1 })
      .limit(5)
      .populate('userId', 'name email status');

    const [recentUsers, recentReviews] = await Promise.all([
      User.find().sort({ createdAt: -1 }).limit(8).select('name email role createdAt'),
      Review.find().sort({ createdAt: -1 }).limit(8)
        .populate('reviewerId', 'name').populate('providerId', 'profession'),
    ]);
    const activity = [
      ...recentUsers.map(u => ({
        type: 'new_user', date: u.createdAt,
        text: `${u.name} se registró como ${u.role === 'provider' ? 'prestador' : 'buscador'}`,
        icon: u.role === 'provider' ? '🔧' : '🔍',
      })),
      ...recentReviews.map(r => ({
        type: 'new_review', date: r.createdAt,
        text: `${r.reviewerId?.name || 'Alguien'} dejó ${r.rating}★ a ${r.providerId?.profession || 'un prestador'}`,
        icon: '⭐',
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);

    const activeBanners = await BannerAd.countDocuments({ status: 'active' });

    res.json({
      totalUsers, totalProviders, totalSeekers, totalReviews,
      plusProviders, verifiedProviders, blockedUsers, inactiveUsers, activeBanners,
      newUsersWeek, weekTrend,
      dailyRegistrations: Object.values(dailyMap),
      ratingsData, rolesData, topProviders, activity,
    });
  } catch (err) {
    console.error('getMetrics:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/activity ──────────────────────────────
const getActivity = async (req, res) => {
  try {
    const periodMap = { '1m': 30, '3m': 90, '6m': 180, 'all': 365 };
    const days = periodMap[req.query.period] ?? 7;
    const since = new Date(Date.now() - days * 86400000);
    const [recentUsers, recentReviews] = await Promise.all([
      User.find({ createdAt: { $gte: since } }).select('name email role createdAt').sort({ createdAt: -1 }).limit(10),
      Review.find({ createdAt: { $gte: since } })
        .populate('reviewerId', 'name').populate('providerId', 'profession')
        .sort({ createdAt: -1 }).limit(10),
    ]);

    const feed = [
      ...recentUsers.map(u => ({
        type: 'new_user', icon: u.role === 'provider' ? '🔧' : '🔍',
        text: `${u.name} se registró como ${u.role === 'provider' ? 'prestador' : 'buscador'}`,
        at: u.createdAt,
      })),
      ...recentReviews.map(r => ({
        type: 'new_review', icon: '⭐',
        text: `${r.reviewerId?.name || 'Alguien'} dejó ${r.rating}★ a ${r.providerId?.profession || 'un prestador'}`,
        at: r.createdAt,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);

    res.json({ feed });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/live ──────────────────────────────────
const getLiveSnapshot = async (req, res) => {
  try {
    const oneDayAgo  = new Date(Date.now() - 86400000);
    const oneHourAgo = new Date(Date.now() - 3600000);

    const [
      totalActive, newToday, newThisHour,
      activeProviders, newReviewsToday,
      pendingVerifications, activeBanners,
      blockedToday,
    ] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      User.countDocuments({ createdAt: { $gte: oneHourAgo } }),
      ProviderProfile.countDocuments({ userId: { $exists: true } }),
      Review.countDocuments({ createdAt: { $gte: oneDayAgo }, hidden: false }),
      Verification.countDocuments({ status: 'pending' }),
      BannerAd.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'blocked', updatedAt: { $gte: oneDayAgo } }),
    ]);

    const [latestUsers, latestReviews] = await Promise.all([
      User.find({ createdAt: { $gte: oneDayAgo } }).sort({ createdAt: -1 }).limit(5).select('name role createdAt email'),
      Review.find({ createdAt: { $gte: oneDayAgo } }).sort({ createdAt: -1 }).limit(5)
        .populate('reviewerId', 'name').populate('providerId', 'profession'),
    ]);

    const latestActivity = [
      ...latestUsers.map(u => ({
        icon: u.role === 'provider' ? '🔧' : '🔍',
        text: `${u.name} se registró`,
        sub: u.email,
        at: u.createdAt,
      })),
      ...latestReviews.map(r => ({
        icon: '⭐',
        text: `${r.reviewerId?.name || 'Alguien'} dejó ${r.rating}★`,
        sub: r.providerId?.profession || 'a un prestador',
        at: r.createdAt,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);

    res.json({
      totalActive, newToday, newThisHour, activeProviders,
      newReviewsToday, pendingVerifications, activeBanners, blockedToday,
      latestActivity, timestamp: new Date(),
    });
  } catch (err) {
    console.error('getLiveSnapshot:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/providers/featured ────────────────────
const getFeaturedProviders = async (req, res) => {
  try {
    const providers = await ProviderProfile.find()
      .populate('userId', 'name email status')
      .select('profession zone plan verified urgencyAvailable ratingAverage reviewsCount profilePhoto userId activeStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(300);
    res.json({ providers });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── PATCH /api/admin/providers/:id/urgency ───────────────
const toggleUrgency = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    profile.urgencyAvailable = !profile.urgencyAvailable;
    await profile.save();
    res.json({ message: `Urgencia ${profile.urgencyAvailable ? 'activada' : 'desactivada'}`, profile });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/users ─────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (role) {
      if (role === 'provider') filter.role = { $in: ['provider', 'both'] };
      else if (role === 'seeker') filter.role = { $in: ['seeker', 'both'] };
      else filter.role = role;
    }
    if (status) filter.status = status;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(filter)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await User.countDocuments(filter);

    const usersWithProfile = await Promise.all(users.map(async u => {
  const obj = u.toObject();
  if (u.role === 'provider') {
    const profile = await ProviderProfile.findOne({ userId: u._id })
      .select('profession zone plan verified profilePhoto ratingAverage reviewsCount urgencyAvailable activeStatus lastActiveAt createdAt _id');
    
    if (profile) {
      // Calcular días de actividad
      const now = new Date();
      const lastActive = profile.lastActiveAt || profile.createdAt;
      const daysSinceActive = Math.floor((now - new Date(lastActive)) / (1000 * 60 * 60 * 24));
      const daysSinceCreated = Math.floor((now - new Date(profile.createdAt)) / (1000 * 60 * 60 * 24));

      obj.profile = {
        ...profile.toObject(),
        daysSinceActive,   // días desde última actividad
        daysSinceCreated,  // días desde que se registró
        lastActiveLabel: profile.lastActiveAt
          ? (daysSinceActive === 0 ? 'Hoy' : `Hace ${daysSinceActive} día${daysSinceActive === 1 ? '' : 's'}`)
          : 'Sin actividad registrada',
      };
    }
  }
  return obj;
}));

    res.json({ users: usersWithProfile, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/users/:id ─────────────────────────────
const getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -emailVerificationToken -passwordResetToken');
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    let profile = null;
    let seekerProfile = null;

    if (user.role === 'provider' || user.role === 'both') {
      const rawProfile = await ProviderProfile.findOne({ userId: user._id }).lean();
      console.log('DEBUG getUserDetail - userId:', user._id, '- rawProfile:', rawProfile?._id || 'NULL');
      if (rawProfile) {
        const now = new Date();
        const lastActive = rawProfile.lastActiveAt || rawProfile.createdAt;
        const daysSinceActive = Math.floor((now - new Date(lastActive)) / (1000 * 60 * 60 * 24));
        const daysSinceCreated = Math.floor((now - new Date(rawProfile.createdAt)) / (1000 * 60 * 60 * 24));
        profile = {
          ...rawProfile,
          daysSinceActive,
          daysSinceCreated,
          lastActiveLabel: rawProfile.lastActiveAt
            ? (daysSinceActive === 0 ? 'Hoy' : `Hace ${daysSinceActive} día${daysSinceActive === 1 ? '' : 's'}`)
            : 'Sin actividad registrada',
        };
      }
    }
    if (user.role === 'seeker' || user.role === 'both') {
      seekerProfile = await SeekerProfile.findOne({ userId: user._id });
    }

    let reviews = [];
    if (profile && (user.role === 'provider' || user.role === 'both')) {
      reviews = await Review.find({ providerId: profile._id, hidden: false })
        .populate('reviewerId', 'name').sort({ createdAt: -1 }).limit(5);
    }

    res.json({ user, profile, seekerProfile, reviews });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/users/export ──────────────────────────
const exportUsers = async (req, res) => {
  try {
    const { role, status } = req.query;
    const filter = {};
    if (role) {
      if (role === 'provider') filter.role = { $in: ['provider', 'both'] };
      else if (role === 'seeker') filter.role = { $in: ['seeker', 'both'] };
      else filter.role = role;
    }
    if (status) filter.status = status;

    const users = await User.find(filter).select('-password -emailVerificationToken -passwordResetToken').sort({ createdAt: -1 });
    const withProfiles = await Promise.all(users.map(async u => {
      const obj = u.toObject();
      if (u.role === 'provider') obj.profile = await ProviderProfile.findOne({ userId: u._id }).select('profession zone plan verified ratingAverage reviewsCount');
      return obj;
    }));

    const headers = ['Nombre', 'Email', 'Rol', 'Estado', 'Email verificado', 'Profesión', 'Zona', 'Plan', 'Verificado', 'Rating', 'Reseñas', 'Registrado'];
    const rows = withProfiles.map(u => [
      u.name, u.email, u.role, u.status,
      u.emailVerified ? 'Sí' : 'No',
      u.profile?.profession || '', u.profile?.zone || '',
      u.profile?.plan || '', u.profile?.verified ? 'Sí' : '',
      u.profile?.ratingAverage?.toFixed(1) || '', u.profile?.reviewsCount || '',
      new Date(u.createdAt).toLocaleDateString('es-AR'),
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="usuarios-zonaservicios.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── PATCH bulk ───────────────────────────────────────────
const bulkAction = async (req, res) => {
  try {
    const { userIds, action } = req.body;
    if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ message: 'Sin IDs' });
    if (!['block', 'unblock', 'deactivate', 'delete'].includes(action)) return res.status(400).json({ message: 'Acción inválida' });

    if (action === 'delete') {
      await User.deleteMany({ _id: { $in: userIds }, role: { $ne: 'admin' } });
      return res.json({ message: `${userIds.length} cuentas eliminadas` });
    }

    const status = action === 'block' ? 'blocked' : action === 'deactivate' ? 'inactive' : 'active';
    await User.updateMany({ _id: { $in: userIds }, role: { $ne: 'admin' } }, { status });
    res.json({ message: `${userIds.length} usuarios actualizados`, status });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── PATCH block/unblock/deactivate/reactivate ────────────
const blockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    if (user.role === 'admin') return res.status(400).json({ message: 'No podés bloquear un admin' });
    user.status = 'blocked'; await user.save();
    res.json({ message: 'Bloqueado', user: { id: user._id, status: user.status } });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

const unblockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    user.status = 'active'; await user.save();
    res.json({ message: 'Desbloqueado', user: { id: user._id, status: user.status } });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    if (user.role === 'admin') return res.status(400).json({ message: 'No podés desactivar un admin' });
    user.status = 'inactive'; await user.save();
    res.json({ message: 'Cuenta desactivada', user: { id: user._id, status: user.status } });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

const reactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    user.status = 'active'; await user.save();
    res.json({ message: 'Cuenta reactivada', user: { id: user._id, status: user.status } });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

// ── DELETE /api/admin/users/:id ──────────────────────────
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    if (user.role === 'admin') return res.status(400).json({ message: 'No podés eliminar un admin' });

    if (user.role === 'provider' || user.role === 'both') {
      await ProviderProfile.deleteOne({ userId: user._id });
      await Verification.deleteOne({ userId: user._id });
    }
    if (user.role === 'seeker' || user.role === 'both') {
      await SeekerProfile.deleteOne({ userId: user._id });
    }

    await User.deleteOne({ _id: user._id });
    res.json({ message: 'Cuenta eliminada permanentemente', userId: req.params.id });
  } catch (err) {
    console.error('deleteUser:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── PATCH verify/unverify ────────────────────────────────
const verifyProvider = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    profile.verified = true; await profile.save();
    res.json({ message: 'Verificado', profile });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

const unverifyProvider = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    profile.verified = false; await profile.save();
    res.json({ message: 'Verificación removida', profile });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

// ── PATCH upgrade plan ───────────────────────────────────
const upgradePlan = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free', 'plus', 'premium'].includes(plan))
      return res.status(400).json({ message: 'Plan inválido. Opciones: free, plus, premium' });
    const profile = await ProviderProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    profile.plan = plan; await profile.save();
    res.json({ message: `Plan → ${plan}`, profile });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

// ── Reseñas ──────────────────────────────────────────────
const getReviews = async (req, res) => {
  try {
    const { hidden, page = 1, limit = 15 } = req.query;
    const filter = {};
    if (hidden === 'true') filter.hidden = true;
    else if (hidden === 'false') filter.hidden = false;
    const skip    = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await Review.find(filter)
      .populate('reviewerId', 'name email')
      .populate('providerId', 'profession')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Review.countDocuments(filter);
    res.json({ reviews, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

const hideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { hidden: true }, { new: true });
    if (!review) return res.status(404).json({ message: 'No encontrada' });
    res.json({ message: 'Oculta', review });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

const showReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { hidden: false }, { new: true });
    if (!review) return res.status(404).json({ message: 'No encontrada' });
    res.json({ message: 'Visible', review });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

// ── GET /api/admin/search ────────────────────────────────
const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ users: [], providers: [] });
    const regex = { $regex: q, $options: 'i' };
    const users = await User.find({ $or: [{ name: regex }, { email: regex }] })
      .select('name email role status').limit(6);
    const providers = await ProviderProfile.find({ $or: [{ profession: regex }, { zone: regex }] })
      .select('profession zone plan verified profilePhoto userId').limit(4)
      .populate('userId', 'name email');
    res.json({ users, providers });
  } catch (err) { res.status(500).json({ message: 'Error interno' }); }
};

// ── PATCH verify email manual ────────────────────────────
const verifyUserEmail = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id, { emailVerified: true }, { new: true }
    ).select('name email emailVerified');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ message: 'Email verificado manualmente', user });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/admin/banners ───────────────────────────────
const getAdminBanners = async (req, res) => {
  try {
    const { status, page = 1, limit = 15 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const banners = await BannerAd.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip).limit(parseInt(limit));
    const total = await BannerAd.countDocuments(filter);
    res.json({ banners, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── PATCH /api/admin/banners/:id ─────────────────────────
const updateAdminBanner = async (req, res) => {
  try {
    const { status, title } = req.body;
    const allowed = ['active', 'pending_payment', 'pending_approval', 'expired', 'rejected'];
    if (status && !allowed.includes(status)) return res.status(400).json({ message: 'Estado inválido' });
    const update = {};
    if (status) update.status = status;
    if (title)  update.title  = title;
    const banner = await BannerAd.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });
    res.json({ message: 'Banner actualizado', banner });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── DELETE /api/admin/banners/:id ────────────────────────
const deleteAdminBanner = async (req, res) => {
  try {
    const banner = await BannerAd.findByIdAndUpdate(
      req.params.id,
      { status: 'deleted' },
      { new: true }
    );
    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });
    res.json({ message: 'Banner marcado como eliminado', banner });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── DELETE /api/admin/providers/ghost/:id ────────────────
const deleteGhostProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await ProviderProfile.findByIdAndDelete(id);
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    if (profile.userId) await Verification.deleteOne({ userId: profile.userId });
    res.json({ message: 'Prestador fantasma eliminado', id });
  } catch (err) {
    console.error('deleteGhostProvider error:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── POST /api/admin/banners — crear banner desde admin (sin pago) ──
// Ahora soporta todas las posiciones con precio por posición informativo.
const createAdminBanner = async (req, res) => {
  try {
    const { title, imageUrl, linkUrl, position = 'sidebar_left', weeks, startsAt } = req.body;

    if (!imageUrl) return res.status(400).json({ message: 'La imagen es obligatoria' });
    if (!weeks || weeks < 1) return res.status(400).json({ message: 'Semanas inválidas' });

    // Validar posición
    const validPositions = Object.keys(SLOT_PRICES);
    if (!validPositions.includes(position)) {
      return res.status(400).json({
        message: `Posición inválida. Opciones: ${validPositions.join(', ')}`,
      });
    }

    const start = startsAt ? new Date(startsAt) : new Date();
    const end   = new Date(start.getTime() + weeks * 7 * 86400000);

    const banner = await BannerAd.create({
      userId:     req.user._id,
      title:      title || 'Banner admin',
      imageUrl,
      linkUrl:    linkUrl || '',
      position,
      pricePerWeek: SLOT_PRICES[position], // registramos el precio de referencia
      weeks,
      startsAt:   start,
      endsAt:     end,
      status:     'active',
      amountPaid: 0,
      adminNotes: `Creado desde panel admin sin pago — ${POSITION_LABELS[position] || position}`,
    });

    res.status(201).json({ message: 'Banner creado', banner });
  } catch (err) {
    console.error('createAdminBanner error:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

const AdminLog = require('../models/AdminLog'); // ajustá el path si está en models/
// ── POST /api/admin/logs ─────────────────────────────────
const createAdminLog = async (req, res) => {
  try {
    const { action, targetType, targetId, targetName, detail } = req.body;
    await AdminLog.create({
      adminId:   req.user._id,
      adminName: req.user.name,
      action, targetType, targetId, targetName, detail,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Error al guardar log' });
  }
};

const deleteAdminLog = async (req, res) => {
  try {
    const AdminLog = require('../models/AdminLog');
    const log = await AdminLog.findByIdAndDelete(req.params.id);
    if (!log) return res.status(404).json({ message: 'Log no encontrado' });
    res.json({ ok: true, message: 'Log eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar log' });
  }
};

// ── GET /api/admin/logs ──────────────────────────────────
const getAdminLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, search } = req.query;
    const AdminLog = require('../models/AdminLog');
    
    const filter = {};
    if (action) filter.action = { $regex: action, $options: 'i' };
    if (search) {
      filter.$or = [
        { adminName:  { $regex: search, $options: 'i' } },
        { targetName: { $regex: search, $options: 'i' } },
        { action:     { $regex: search, $options: 'i' } },
        { detail:     { $regex: search, $options: 'i' } },
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const logs  = await AdminLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await AdminLog.countDocuments(filter);
    res.json({ logs, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener logs' });
  }
};

module.exports = {
  getMetrics, getActivity, getLiveSnapshot,
  getFeaturedProviders, toggleUrgency,
  getUsers, getUserDetail, exportUsers,
  bulkAction, blockUser, unblockUser, deactivateUser, reactivateUser, deleteUser,
  verifyProvider, unverifyProvider, upgradePlan,
  getReviews, hideReview, showReview,
  globalSearch, verifyUserEmail,
  getAdminBanners, updateAdminBanner, deleteAdminBanner, createAdminBanner,
  deleteGhostProvider,
  createAdminLog, getAdminLogs, deleteAdminLog,
};