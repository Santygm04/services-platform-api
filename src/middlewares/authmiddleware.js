const jwt = require('jsonwebtoken');
const User = require('../models/user');

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

    req.user = user;
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