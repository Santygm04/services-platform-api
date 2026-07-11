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

// Uso: authorizeSection('banners') — va DESPUÉS de authorizeRoles('admin')
// Los superadmins siempre pasan. Los admins normales necesitan el permiso en true.
const authorizeSection = (section) => {
  return (req, res, next) => {
    // Este chequeo solo aplica a admins. Un buscador/prestador usando estas mismas
    // rutas para sus propios recursos (ej: mensajes) no está sujeto a adminPermissions.
    if (req.user.role !== 'admin') return next();
    if (req.user.isSuperAdmin) return next();
    const allowed = req.user.adminPermissions?.[section];
    if (!allowed) {
      return res.status(403).json({
        message: `No tenés permiso para acceder a la sección "${section}". Pedile a un superadmin que te lo habilite.`,
      });
    }
    next();
  };
};

module.exports = { authorizeRoles, authorizeSection };