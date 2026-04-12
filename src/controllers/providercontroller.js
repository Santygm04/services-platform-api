const ProviderProfile = require('../models/providerprofile');
const Review          = require('../models/review');
const SeekerProfile   = require('../models/seekerprofile');
const User            = require('../models/user');
const ProfileEvent    = require('../models/profileevent');

const DAILY_VIEW_LIMIT = 5;

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

const getPublicProfile = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id).populate(
      'userId',
      'name emailVerified'
    );

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    const viewerId = req.user?._id?.toString();
    const ownerId  = profile.userId._id.toString();

    if (viewerId !== ownerId) {
      await registerView(profile);
      ProfileEvent.create({ providerId: profile._id, eventType: 'profile_view' }).catch(() => {});
    }

    const isAuthenticated  = !!req.user;
    const responseProfile  = buildPublicProfile(profile, isAuthenticated);

    res.json({ profile: responseProfile });
  } catch (error) {
    console.error('getPublicProfile error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

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

const getMyStats = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    const isPlus = profile.plan === 'plus';
    const today  = isToday(profile.viewsTracking?.date);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const allReviews    = await Review.find({ providerId: profile._id });
    const repliedCount  = allReviews.filter(r => r.reply).length;
    const recentReviews = allReviews.filter(r => new Date(r.createdAt) >= sevenDaysAgo);

    const ratingsDistribution = [1, 2, 3, 4, 5].map(n => ({
      rating:   `${n}★`,
      cantidad: allReviews.filter(r => r.rating === n && !r.hidden).length,
    }));

    const totalViews = profile.viewsTracking?.count || 0;
    const dailyViews = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dailyViews.push({
        date:  d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
        views: 0,
      });
    }
    if (today && dailyViews.length > 0) {
      dailyViews[dailyViews.length - 1].views = profile.viewsTracking.count || 0;
    }

    const betterProviders = await ProviderProfile.countDocuments({
      ratingAverage: { $gt: profile.ratingAverage || 0 },
      reviewsCount:  { $gt: 0 },
    });
    const totalRanked  = await ProviderProfile.countDocuments({ reviewsCount: { $gt: 0 } });
    const rankPosition = betterProviders + 1;

    const fields = [
      !!profile.profession,
      !!profile.zone,
      !!profile.profilePhoto,
      !!profile.bio,
      profile.portfolio?.length > 0,
      profile.links?.length > 0,
    ];
    const profileCompleteness = Math.round(
      (fields.filter(Boolean).length / fields.length) * 100
    );

    res.json({
      plan:               profile.plan,
      ratingAverage:      profile.ratingAverage,
      reviewsCount:       profile.reviewsCount,
      viewsToday:         today ? profile.viewsTracking.count : 0,
      totalViews,
      dailyLimit:         isPlus ? null : DAILY_VIEW_LIMIT,
      limitReached:       !isPlus && today && profile.viewsTracking.count >= DAILY_VIEW_LIMIT,
      repliedReviews:     repliedCount,
      recentReviewsCount: recentReviews.length,
      ratingsDistribution,
      dailyViews:         isPlus ? dailyViews : [],
      rankPosition:       profile.reviewsCount > 0 ? rankPosition : null,
      totalRanked,
      profileCompleteness,
      isVerified:         profile.verified,
    });
  } catch (error) {
    console.error('getMyStats error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

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

// ── helpers ────────────────────────────────────────────────
const registerView = async (profile) => {
  if (profile.plan === 'plus') {
    profile.viewsTracking.count = (profile.viewsTracking.count || 0) + 1;
    profile.viewsTracking.date  = new Date();
  } else {
    const today = isToday(profile.viewsTracking?.date);
    if (!today) {
      profile.viewsTracking = { date: new Date(), count: 1 };
    } else if (profile.viewsTracking.count < DAILY_VIEW_LIMIT) {
      profile.viewsTracking.count += 1;
    }
  }
  await profile.save();
};

const isToday = (date) => {
  if (!date) return false;
  const d   = new Date(date);
  const now = new Date();
  return (
    d.getDate()     === now.getDate()     &&
    d.getMonth()    === now.getMonth()    &&
    d.getFullYear() === now.getFullYear()
  );
};

const buildPublicProfile = (profile, isAuthenticated) => {
  const base = {
    _id:              profile._id,
    userId:           profile.userId,
    profession:       profile.profession,
    zone:             profile.zone,
    bio:              profile.bio,
    profilePhoto:     profile.profilePhoto,
    plan:             profile.plan,
    verified:         profile.verified,
    urgencyAvailable: profile.urgencyAvailable,
    ratingAverage:    profile.ratingAverage,
    reviewsCount:     profile.reviewsCount,
  };

  if (isAuthenticated) {
    base.phone = profile.phone;
  }

  if (profile.plan === 'plus') {
    base.portfolio = profile.portfolio;
    base.links     = profile.links;
  }

  return base;
};

// ── GET /api/providers/:id/nearby-seekers ──────────────────
const getNearbyActivity = async (req, res) => {
  try {
    const profile = await ProviderProfile.findById(req.params.id).select('zone profession');
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });

    const providerZone = (profile.zone || '').toLowerCase().trim();
    if (!providerZone) return res.json({ seekers: [] });

    const zoneWords = providerZone.split(/[\s,]+/).filter(w => w.length >= 2);
    const regexSource = zoneWords.length ? zoneWords.join('|') : providerZone;
    const zoneRegex = new RegExp(regexSource, 'i');

   const allSeekers = await SeekerProfile.find({ zone: { $regex: zoneRegex } })
  .populate('userId', 'name emailVerified createdAt status')
  .select('zone favorites userId profilePhoto')
  .limit(50);

    const filtered = allSeekers.filter(s =>
      s.userId &&
      s.userId.status !== 'blocked'   &&
      s.userId.status !== 'inactive'  &&
      s.userId.emailVerified
    );

    const scored = filtered.map(s => {
      const seekerZone   = (s.zone || '').toLowerCase().trim();
      let score          = 0;
      const label        = [];
      const profileIdStr = profile._id.toString();

      if (seekerZone === providerZone)                                  { score += 2; label.push('zona exacta'); }
      else if (zoneWords.some(w => seekerZone.includes(w)))             { score += 1; label.push('zona similar'); }

      if (Array.isArray(s.favorites) && s.favorites.some(f => f.toString() === profileIdStr)) {
        score += 3; label.push('te tiene en favoritos');
      }

      return {
  _id:             s._id,
  userId:          s.userId._id,
  name:            s.userId.name,
  zone:            s.zone,
  profilePhoto:    s.profilePhoto || '',
  memberSince:     s.userId.createdAt,
  relevanceScore:  score,
  relevanceLabels: label,
};
    });

    scored.sort((a, b) =>
      b.relevanceScore - a.relevanceScore ||
      new Date(b.memberSince) - new Date(a.memberSince)
    );

    res.json({ seekers: scored.slice(0, 20), zone: profile.zone });
  } catch (err) {
    console.error('getNearbyActivity:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/providers/me/nearby-seekers ────────────────────
const getNearbySeekersForMe = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id }).select('zone _id');
    if (!profile) return res.json({ seekers: [], zone: null });

    const providerZone = (profile.zone || '').toLowerCase().trim();
    if (!providerZone) return res.json({ seekers: [], zone: null });

    const zoneWords = providerZone.split(/[\s,]+/).filter(w => w.length >= 2);
    const regexSource2 = zoneWords.length ? zoneWords.join('|') : providerZone;
    const zoneRegex    = new RegExp(regexSource2, 'i');

   const allSeekers = await SeekerProfile.find({ zone: { $regex: zoneRegex } })
  .populate('userId', 'name emailVerified createdAt status')
  .select('zone favorites userId profilePhoto')
  .limit(60);
    const filtered = allSeekers.filter(s =>
      s.userId &&
      s.userId.status !== 'blocked'  &&
      s.userId.status !== 'inactive' &&
      s.userId.emailVerified
    );

    const profileIdStr = profile._id.toString();

    const scored = filtered.map(s => {
      const seekerZone = (s.zone || '').toLowerCase().trim();
      let score        = 0;
      const labels     = [];

      if (seekerZone === providerZone)                                  { score += 2; labels.push('zona exacta'); }
      else if (zoneWords.some(w => seekerZone.includes(w)))             { score += 1; labels.push('zona similar'); }

      if (Array.isArray(s.favorites) && s.favorites.some(f => f.toString() === profileIdStr)) {
        score += 3; labels.push('te tiene en favoritos');
      }

      return {
  _id:             s._id,
  userId:          s.userId._id,
  name:            s.userId.name,
  zone:            s.zone,
  profilePhoto:    s.profilePhoto || '',
  memberSince:     s.userId.createdAt,
  relevanceScore:  score,
  relevanceLabels: labels,
  hasFavorited:    labels.includes('te tiene en favoritos'),
};
    });

    scored.sort((a, b) =>
      b.relevanceScore - a.relevanceScore ||
      new Date(b.memberSince) - new Date(a.memberSince)
    );

    res.json({ seekers: scored.slice(0, 15), zone: profile.zone });
  } catch (err) {
    console.error('getNearbySeekersForMe:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  trackView,
  getMyStats,
  getAllProviders,
  getNearbyActivity,
  getNearbySeekersForMe,
};