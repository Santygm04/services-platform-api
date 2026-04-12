const Notification = require('../models/notification');

// ── GET /api/notifications ────────────────────────────────────
const getMyNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ userId: req.user._id });

    res.json({
      notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('getMyNotifications error:', err);
    res.status(500).json({ message: 'Error al obtener notificaciones' });
  }
};

// ── GET /api/notifications/unread-count ───────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ unreadCount: count });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    res.status(500).json({ message: 'Error al obtener no leídas' });
  }
};

// ── PATCH /api/notifications/mark-all-read ────────────────────
const markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ markedRead: result.modifiedCount });
  } catch (err) {
    console.error('markAllRead error:', err);
    res.status(500).json({ message: 'Error al marcar como leídas' });
  }
};

// ── PATCH /api/notifications/:id/read ─────────────────────────
const markOneRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ message: 'Notificación marcada como leída' });
  } catch (err) {
    console.error('markOneRead error:', err);
    res.status(500).json({ message: 'Error' });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
};