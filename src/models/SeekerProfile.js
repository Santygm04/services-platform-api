const mongoose = require('mongoose');

const seekerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('SeekerProfile', seekerProfileSchema);