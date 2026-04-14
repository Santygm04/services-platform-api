const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // ── FIX: agregado 'premium' al enum ──
    plan: {
      type: String,
      enum: ['free', 'plus', 'premium'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'cancelled', 'expired', 'paused'],
      default: 'active',
    },
    mpSubscriptionId: { type: String, default: null },
    mpPayerId:        { type: String, default: null },
    startDate:        { type: Date,   default: null },
    endDate:          { type: Date,   default: null },
    cancelledAt:      { type: Date,   default: null },
    type: {
      type: String,
      enum: ['recurring', 'manual'],
      default: 'recurring',
    },
    renewals: [
      {
        date:      { type: Date   },
        amount:    { type: Number },
        paymentId: { type: String },
        status:    { type: String },
      },
    ],
  },
  { timestamps: true }
);

subscriptionSchema.methods.isActive = function () {
  return this.status === 'active' && (!this.endDate || this.endDate > new Date());
};

module.exports =
  mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);