const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const deactivateInactiveProviders = async () => {
  try {
    const cutoff = new Date(Date.now() - THIRTY_DAYS);

    // Buscar prestadores con lastActiveAt viejo O sin lastActiveAt
    // pero que tengan más de 30 días desde su creación (para no afectar nuevos)
    const inactiveProfiles = await ProviderProfile.find({
      activeStatus: true,
      $or: [
        { lastActiveAt: { $lt: cutoff } },
        { lastActiveAt: null, createdAt: { $lt: cutoff } },
      ],
    }).select('userId');

    if (!inactiveProfiles.length) {
      console.log('✅ inactivityJob: ningún prestador para desactivar');
      return;
    }

    const userIds = inactiveProfiles.map(p => p.userId);

    // Desactivar en User
    const userResult = await User.updateMany(
      { _id: { $in: userIds }, role: 'provider', status: 'active' },
      { status: 'inactive' }
    );

    // Desactivar en ProviderProfile
    const profileResult = await ProviderProfile.updateMany(
      { userId: { $in: userIds }, activeStatus: true },
      { activeStatus: false }
    );

    console.log(`🔕 inactivityJob: ${userResult.modifiedCount} usuarios desactivados, ${profileResult.modifiedCount} perfiles ocultos`);
  } catch (err) {
    console.error('❌ inactivityJob error:', err.message);
  }
};

module.exports = { deactivateInactiveProviders };