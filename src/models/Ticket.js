const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    seekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Mismo tipo que ProviderProfile.category — ObjectId ref ServiceCategory,
    // NO string. Así el match por categoría es un $eq directo, sin normalizar texto.
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      required: true,
    },

    description: {
      type: String,
      trim: true,
      required: true,
      maxlength: [1000, 'La descripción no puede superar los 1000 caracteres'],
    },
    photos: {
      type: [String], // URLs Cloudinary, opcional
      default: [],
    },

    urgency: {
      type: String,
      enum: ['green', 'yellow', 'red'],
      required: true,
    },
    maxPrice: {
      type: Number,
      default: null,
      min: 0,
    },

    status: {
      type: String,
      enum: ['searching', 'matched', 'in_progress', 'completed', 'cancelled', 'expired'],
      default: 'searching',
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    matchedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },

    // Prestadores que cancelaron post-match — no se les vuelve a notificar este ticket
    excludedProviders: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],

    // Ubicación del buscador al momento de crear el ticket (para calcular radio)
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },

    // Negociación de precio
    offers: [
      {
        providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        price: { type: Number, min: 0 },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Pedido para un tercero (opcional)
    thirdParty: {
      isThirdParty: { type: Boolean, default: false },
      name: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      notifiedVia: [{ type: String, enum: ['whatsapp', 'email'] }],
    },

    // Registro crudo de a quién se notificó y cómo respondió.
    // El EFECTO de "timeout" sobre ranking/visibilidad NO se implementa acá.
    notifiedProviders: [
      {
        providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notifiedAt: Date,
        respondedAt: { type: Date, default: null },
        response: {
          type: String,
          enum: ['accepted', 'rejected', 'timeout', null],
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

// ── Índices obligatorios ────────────────────────────────────
ticketSchema.index({ location: '2dsphere' });      // radio de búsqueda
ticketSchema.index({ status: 1, category: 1 });    // query de broadcast
ticketSchema.index({ status: 1, expiresAt: 1 });   // job de expiración

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);