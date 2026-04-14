const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    mpPaymentId:       { type: String, required: true, unique: true },
    mpPreferenceId:    { type: String, default: null },
    mpMerchantOrderId: { type: String, default: null },
    type: {
      type: String,
      enum: ['subscription', 'manual'],
      default: 'subscription',
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected', 'cancelled', 'refunded', 'charged_back'],
      required: true,
    },
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'ARS' },

    // ── FIX: agregado 'premium', removido enum estricto para no romper con null ──
    planActivated: {
      type: String,
      enum: ['plus', 'premium', 'free', null],
      default: null,
    },

    periodStart: { type: Date, default: null },
    periodEnd:   { type: Date, default: null },
    rawWebhook:  { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ mpPaymentId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);