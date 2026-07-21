const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['new_seeker_in_zone', 'new_review', 'new_message', 'verification_approved', 'verification_rejected', 'plan_upgraded', 'referral_credit', 'profile_incomplete', 'no_reviews_yet', 'general'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 120,
    },
    body: {
      type: String,
      default: '',
      maxlength: 300,
    },
    // Datos extra según el tipo (ej: seekerId, reviewId, etc.)
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// TTL: auto-borrar notificaciones después de 90 días
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);