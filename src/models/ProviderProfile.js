const mongoose = require('mongoose');

const providerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    profession: {
      type: String,
      trim: true,
      default: '',
    },
    zone: {
      type: String,
      trim: true,
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'La bio no puede superar los 500 caracteres'],
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      default: null,
    },
    profilePhoto: {
      type: String,
      default: '',
    },
    plan: {
      type: String,
      enum: ['free', 'plus'],
      default: 'free',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    urgencyAvailable: {
      type: Boolean,
      default: false,
    },
    // Contador diario de visualizaciones para plan Free
    viewsTracking: {
      date: {
        type: Date,
        default: null,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    // Solo Plus — se guardan pero solo se exponen si plan === 'plus'
    portfolio: [
      {
        imageUrl: { type: String },
        caption: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    links: [
      {
        label: { type: String },
        url: { type: String },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.ProviderProfile || mongoose.model('ProviderProfile', providerProfileSchema);