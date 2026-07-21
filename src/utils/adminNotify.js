const AdminNotification = require('../models/adminNotification');

// Helper de una sola línea para notificar al panel admin desde cualquier controller.
// Uso: notifyAdmins('new_review', 'Nueva reseña: Juan', 'Juan dejó 5★...', '/admin?tab=reviews', { reviewId })
const notifyAdmins = async (type, title, body = '', link = '', meta = {}) => {
  return AdminNotification.create({ type, title, body, link, meta });
};

module.exports = { notifyAdmins };