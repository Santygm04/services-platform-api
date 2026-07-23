const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, 'El comentario no puede superar los 1000 caracteres'],
      default: '',
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
    },
    alias: {
      type: String,
      trim: true,
      maxlength: [50, 'El alias no puede superar los 50 caracteres'],
      default: '',
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
    },
    reply: {
      type: String,
      trim: true,
      maxlength: [500, 'La respuesta no puede superar los 500 caracteres'],
      default: '',
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
    },
    repliedAt: {
      type: Date,
      default: null,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);