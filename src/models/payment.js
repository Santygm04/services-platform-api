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

    // Datos de MercadoPago
    mpPaymentId:      { type: String, required: true, unique: true }, // id del pago en MP
    mpPreferenceId:   { type: String, default: null },                // preference_id
    mpMerchantOrderId:{ type: String, default: null },

    type: {
      type: String,
      enum: ['subscription', 'manual'],
      default: 'subscription',
    },

    status: {
      type: String,
      // approved / pending / rejected / cancelled / refunded / charged_back
      enum: ['approved', 'pending', 'rejected', 'cancelled', 'refunded', 'charged_back'],
      required: true,
    },

    amount:   { type: Number, required: true },
    currency: { type: String, default: 'ARS' },

    // Plan que se activó con este pago
    planActivated: { type: String, enum: ['plus', 'free'], default: 'plus' },

    // Período que cubre este pago
    periodStart: { type: Date, default: null },
    periodEnd:   { type: Date, default: null },

    // Raw del webhook (para debugging y auditoría)
    rawWebhook: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// Índices útiles para consultas del panel admin
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ mpPaymentId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);