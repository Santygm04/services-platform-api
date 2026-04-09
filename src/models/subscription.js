const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // un usuario → una suscripción activa
    },
    plan: {
      type: String,
      enum: ['free', 'plus'],
      default: 'free',
    },
    status: {
      type: String,
      // active    → suscripción vigente
      // pending   → pago iniciado, esperando confirmación
      // cancelled → cancelada por el usuario
      // expired   → venció sin renovar
      // paused    → retenida por MercadoPago (ej: fallo de cobro)
      enum: ['active', 'pending', 'cancelled', 'expired', 'paused'],
      default: 'active',
    },

    // IDs de MercadoPago
    mpSubscriptionId: { type: String, default: null }, // ID suscripción recurrente MP
    mpPayerId:        { type: String, default: null }, // payer_id de MP

    // Fechas
    startDate:   { type: Date, default: null },
    endDate:     { type: Date, default: null }, // cuándo vence el período actual
    cancelledAt: { type: Date, default: null },

    // Tipo de suscripción
    type: {
      type: String,
      enum: ['recurring', 'manual'], // recurrente automático vs. pago manual mensual
      default: 'recurring',
    },

    // Historial de renovaciones (se pushea en cada webhook authorized)
    renewals: [
      {
        date:      { type: Date },
        amount:    { type: Number },
        paymentId: { type: String }, // mp payment_id
        status:    { type: String }, // approved / rejected
      },
    ],
  },
  { timestamps: true }
);

// Helper: ¿está activa y vigente?
subscriptionSchema.methods.isActive = function () {
  return this.status === 'active' && (!this.endDate || this.endDate > new Date());
};

module.exports = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);