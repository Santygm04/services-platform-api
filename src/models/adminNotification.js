const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'new_provider', 'new_seeker', 'new_review', 'new_report',
        'verification_pending', 'banner_paid', 'plan_paid', 'general',
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 150 },
    body:  { type: String, default: '', maxlength: 300 },
    // Ruta del panel admin a la que navega al hacer click (ej: '/admin?tab=reviews')
    link:  { type: String, default: '' },
    meta:  { type: mongoose.Schema.Types.Mixed, default: {} },
    // IDs de los admins que ya la marcaron como leída — estado individual por admin
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// TTL: auto-borrar después de 90 días
adminNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.models.AdminNotification || mongoose.model('AdminNotification', adminNotificationSchema);