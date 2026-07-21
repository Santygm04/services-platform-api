const ProviderProfile = require('../models/ProviderProfile');
const Notification    = require('../models/notification');

const SEVEN_DAYS        = 7  * 24 * 60 * 60 * 1000;
const REMINDER_COOLDOWN = 14 * 24 * 60 * 60 * 1000; // no repetir antes de 14 días

// ── Helper: mismos checks que ProviderDashboard.jsx / ProviderProfile.jsx ──
const getMissingFields = (profile) => {
  const missing = [];
  if (!profile.profilePhoto) missing.push('foto de perfil');
  if (!profile.profession)   missing.push('profesión');
  if (!profile.zone)         missing.push('zona de trabajo');
  if (!profile.bio)          missing.push('biografía');
  if (!profile.phone)        missing.push('teléfono');
  if (!profile.verified)     missing.push('verificación de identidad');

  const isPaidPlan = profile.plan === 'plus' || profile.plan === 'premium';
  if (isPaidPlan) {
    if (!profile.portfolio?.length) missing.push('portfolio (al menos 1 foto)');
    if (!profile.links?.length)     missing.push('links/redes');
  }

  return missing;
};

const checkProfileHealth = async () => {
  try {
    const cutoffNew      = new Date(Date.now() - SEVEN_DAYS);       // solo perfiles con más de 7 días
    const cutoffCooldown = new Date(Date.now() - REMINDER_COOLDOWN);

    const profiles = await ProviderProfile.find({
      activeStatus: true,
      createdAt: { $lt: cutoffNew },
    }).select(
      'userId profilePhoto profession zone bio phone verified plan portfolio links reviewsCount lastProfileReminderAt lastNoReviewsReminderAt createdAt'
    );

    let profileNotifs = 0;
    let reviewNotifs  = 0;

    for (const profile of profiles) {
      // ── Perfil incompleto ──────────────────────────────
      const missing = getMissingFields(profile);
      const canRemindProfile = !profile.lastProfileReminderAt || profile.lastProfileReminderAt < cutoffCooldown;

      if (missing.length > 0 && canRemindProfile) {
        await Notification.create({
          userId: profile.userId,
          type: 'profile_incomplete',
          title: '📋 Completá tu perfil',
          body: `Te falta agregar: ${missing.join(', ')}. Un perfil completo genera más confianza y aparece mejor en las búsquedas.`,
          meta: { missingFields: missing },
        });
        await ProviderProfile.findByIdAndUpdate(profile._id, { lastProfileReminderAt: new Date() });
        profileNotifs++;
      }

      // ── Sin reseñas todavía ────────────────────────────
      const canRemindReviews = !profile.lastNoReviewsReminderAt || profile.lastNoReviewsReminderAt < cutoffCooldown;
      if ((profile.reviewsCount || 0) === 0 && canRemindReviews) {
        await Notification.create({
          userId: profile.userId,
          type: 'no_reviews_yet',
          title: '⭐ Todavía no tenés reseñas',
          body: 'Pedile a tus clientes que dejen una reseña — los perfiles con reseñas generan mucha más confianza y aparecen más arriba en las búsquedas.',
          meta: {},
        });
        await ProviderProfile.findByIdAndUpdate(profile._id, { lastNoReviewsReminderAt: new Date() });
        reviewNotifs++;
      }
    }

    console.log(`📋 profileHealthJob: ${profileNotifs} avisos de perfil incompleto, ${reviewNotifs} avisos de sin reseñas`);
  } catch (err) {
    console.error('❌ profileHealthJob error:', err.message);
  }
};

module.exports = { checkProfileHealth };