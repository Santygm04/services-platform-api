// Uso: authorizeRoles('admin') o authorizeRoles('provider', 'admin')
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}.`,
      });
    }
    next();
  };
};

module.exports = { authorizeRoles };