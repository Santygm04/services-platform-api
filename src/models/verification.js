const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    dniFront: { type: String, default: '' },
    dniBack: { type: String, default: '' },
    selfie: { type: String, default: '' },
    status: {
      type: String,
      enum: ['incomplete', 'pending', 'approved', 'rejected'],
      default: 'incomplete',
    },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: { type: String, default: '' },
    attempts: { type: Number, default: 0 },

    // ── Campos de verificación con IA ──
    aiAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    aiAutoApproved: {
      type: Boolean,
      default: false,
    },
    aiReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Verification || mongoose.model('Verification', verificationSchema);