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
    },
    profilePhoto: {
      type: String,
      default: '',
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
        keyword:   { type: String, trim: true, default: '' },
        zone:      { type: String, trim: true, default: '' },
        searchedAt:{ type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.SeekerProfile || mongoose.model('SeekerProfile', seekerProfileSchema);