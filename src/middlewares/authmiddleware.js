const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');

// Verifica que el JWT sea válido y adjunta el usuario a req.user
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No autorizado. Token requerido.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password -emailVerificationToken');
    if (!user) {
      return res.status(401).json({ message: 'Token inválido. Usuario no encontrado.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ message: 'Tu cuenta ha sido suspendida.' });
    }

    // ── Auto-reactivar si estaba inactivo por inactividad ──
    // Solo si fue desactivado automáticamente (no bloqueado manualmente)
    if (user.status === 'inactive' && user.role === 'provider') {
      user.status = 'active';
      await user.save();

      // También reactivar activeStatus del perfil
      await ProviderProfile.findOneAndUpdate(
        { userId: user._id },
        { activeStatus: true }
      );
    }

    req.user = user;

    // ── Actualizar lastActiveAt del prestador (máx 1 vez cada 10 min) ──
    if (user.role === 'provider') {
      const TEN_MINUTES = 10 * 60 * 1000;
      const now = Date.now();

      ProviderProfile.findOne({ userId: user._id })
        .then(profile => {
          if (!profile) return;
          const lastActive = profile.lastActiveAt ? profile.lastActiveAt.getTime() : 0;
          if (now - lastActive > TEN_MINUTES) {
            profile.lastActiveAt = new Date();
            profile.save().catch(() => {}); // silencioso, no bloquea el request
          }
        })
        .catch(() => {});
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};

// Verifica que el email esté confirmado antes de permitir la acción
const requireEmailVerified = (req, res, next) => {
  if (!req.user.emailVerified) {
    return res.status(403).json({
      message: 'Debés verificar tu email antes de realizar esta acción.',
    });
  }
  next();
};

// Adjunta el usuario si hay token, pero no bloquea si no hay
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -emailVerificationToken');
    if (user && user.status === 'active') req.user = user;
    next();
  } catch {
    next();
  }
};

module.exports = { protect, requireEmailVerified, optionalAuth };