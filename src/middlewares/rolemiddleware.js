// Uso: authorizeRoles('admin') o authorizeRoles('provider', 'admin')
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    const hasAccess =
      roles.includes(userRole) ||
      (userRole === 'both' && roles.some(r => ['provider', 'seeker'].includes(r)));
    if (!hasAccess) {
      return res.status(403).json({
        message: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}.`,
      });
    }
    next();
  };
};

module.exports = { authorizeRoles };