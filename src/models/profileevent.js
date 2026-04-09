const mongoose = require('mongoose');

const profileEventSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ['profile_view', 'whatsapp_click', 'phone_click', 'share_click', 'link_click'],
      required: true,
    },
    meta: {
      // Para link_click: { linkUrl, linkLabel }
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// TTL: borrar eventos después de 90 días automáticamente
profileEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.models.ProfileEvent || mongoose.model('ProfileEvent', profileEventSchema);