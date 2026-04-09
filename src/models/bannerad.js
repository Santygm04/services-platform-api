const mongoose = require('mongoose');

const bannerAdSchema = new mongoose.Schema(
  {
    // Quién compró el banner (prestador)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Imagen del banner
    imageUrl: {
      type: String,
      default: null, // null = usar banner predeterminado
    },

    // URL de destino al hacer clic
    linkUrl: {
      type: String,
      trim: true,
      default: '',
    },

    // Texto alternativo / título del anuncio
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },

    // Posición (por ahora solo 'sidebar', extensible)
    position: {
      type: String,
      enum: ['sidebar', 'home_top', 'results_bottom', 'featured'],
      default: 'sidebar',
    },

    // Fechas de vigencia
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },

    // Semanas contratadas
    weeks: {
      type: Number,
      min: 1,
      max: 52,
      required: true,
    },

    // Precio pagado
    amountPaid: {
      type: Number,
      default: 0,
    },

    // Estado
    status: {
      type: String,
      enum: ['pending_payment', 'active', 'expired', 'cancelled'],
      default: 'pending_payment',
    },

    // MercadoPago
    mpPaymentId: {
      type: String,
      default: null,
    },
    mpPreferenceId: {
      type: String,
      default: null,
    },

    // Notas internas (admin)
    adminNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Índices
bannerAdSchema.index({ position: 1, status: 1, startsAt: 1, endsAt: 1 });
bannerAdSchema.index({ userId: 1 });

module.exports =
  mongoose.models.BannerAd || mongoose.model('BannerAd', bannerAdSchema);