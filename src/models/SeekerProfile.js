const mongoose = require('mongoose');

const seekerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    zone: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
    },
    profilePhoto: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
      validate: {
        validator: (v) => {
          if (!v) return true;
          try {
            return ['http:', 'https:'].includes(new URL(v).protocol);
          } catch {
            return false;
          }
        },
        message: 'profilePhoto debe ser una URL http(s) válida',
      },
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProviderProfile',
      },
    ],
    contactHistory: [
      {
        providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ProviderProfile',
        },
        contactedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ── Búsquedas recientes ───────────────────────────────
    // Se guarda la última keyword/zona buscada con timestamp.
    // Máximo 10 entradas; las más viejas se descartan automáticamente.
    recentSearches: [
      {
        keyword: {
          type: String,
          trim: true,
          maxlength: 100,
          default: '',
          set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
        },
        zone: {
          type: String,
          trim: true,
          maxlength: 100,
          default: '',
          set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
        },
        searchedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.SeekerProfile || mongoose.model('SeekerProfile', seekerProfileSchema);