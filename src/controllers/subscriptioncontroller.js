const { MercadoPagoConfig, Preference, Payment, PreApproval } = require('mercadopago');
const Subscription   = require('../models/subscription');
const PaymentModel   = require('../models/payment');
const ProviderProfile = require('../models/providerprofile');
const User           = require('../models/user');
const { sendUpgradePlusEmail } = require('../services/emailservice');

// ── Precio Plus (cambiarlo cuando se confirme con la pasarela) ──
const PLUS_PRICE_ARS = 4999;
const PLUS_TITLE     = 'ZonaServicios Plus — Suscripción mensual';

// Inicializar cliente MP con access token del .env
const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/create-preference
// Crea una preferencia de pago manual (un solo mes)
// ─────────────────────────────────────────────────────────────
const createPreference = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.role !== 'provider') return res.status(403).json({ message: 'Solo los prestadores pueden suscribirse' });

    const preference = new Preference(mp);
    const response = await preference.create({
      body: {
        items: [
          {
            id: 'plus-monthly',
            title: PLUS_TITLE,
            quantity: 1,
            unit_price: PLUS_PRICE_ARS,
            currency_id: 'ARS',
          },
        ],
        payer: {
          email: user.email,
          name:  user.name,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pago/success`,
          failure: `${process.env.FRONTEND_URL}/pago/failure`,
          pending: `${process.env.FRONTEND_URL}/pago/pending`,
        },
        auto_return: 'approved',
        external_reference: String(user._id), // para identificar al usuario en el webhook
        notification_url: `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
        statement_descriptor: 'ZONASERVICIOS',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to:   new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      },
    });

    res.json({
      preferenceId: response.id,
      initPoint:    response.init_point,      // URL para redirigir al usuario
      sandboxUrl:   response.sandbox_init_point,
    });
  } catch (err) {
    console.error('createPreference error:', err);
    res.status(500).json({ message: 'Error al crear preferencia de pago' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/create-recurring
// Crea una suscripción recurrente automática (PreApproval MP)
// ─────────────────────────────────────────────────────────────
const createRecurring = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.role !== 'provider') return res.status(403).json({ message: 'Solo los prestadores pueden suscribirse' });

    const preApproval = new PreApproval(mp);
    const response = await preApproval.create({
      body: {
        reason:            PLUS_TITLE,
        auto_recurring: {
          frequency:       1,
          frequency_type: 'months',
          transaction_amount: PLUS_PRICE_ARS,
          currency_id:    'ARS',
        },
        payer_email:       user.email,
        back_url:          `${process.env.FRONTEND_URL}/dashboard`,
        external_reference: String(user._id),
        notification_url:  `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
        status:            'pending',
      },
    });

    res.json({
      subscriptionId: response.id,
      initPoint:      response.init_point,
    });
  } catch (err) {
    console.error('createRecurring error:', err);
    res.status(500).json({ message: 'Error al crear suscripción recurrente' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/webhook  (sin autenticación — llamado por MP)
// Procesa notificaciones IPN de MercadoPago
// ─────────────────────────────────────────────────────────────
const webhook = async (req, res) => {
  // MP espera 200 inmediato — procesamos async
  res.sendStatus(200);

  try {
    const { type, data } = req.body;
    if (!type || !data?.id) return;

    console.log(`[WEBHOOK MP] type=${type} id=${data.id}`);

    // ── Pago único (manual) ──────────────────────────────────
    if (type === 'payment') {
      const paymentClient = new Payment(mp);
      const mpPayment = await paymentClient.get({ id: data.id });

      const userId = mpPayment.external_reference;
      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      // Guardar registro del pago
      const existingPayment = await PaymentModel.findOne({ mpPaymentId: String(mpPayment.id) });
      if (existingPayment) return; // idempotencia — ya procesado

      const now     = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);

      await PaymentModel.create({
        userId,
        mpPaymentId:    String(mpPayment.id),
        mpPreferenceId: mpPayment.preference_id,
        type:           'manual',
        status:         mpPayment.status,
        amount:         mpPayment.transaction_amount,
        currency:       mpPayment.currency_id || 'ARS',
        planActivated:  mpPayment.status === 'approved' ? 'plus' : 'free',
        periodStart:    mpPayment.status === 'approved' ? now : null,
        periodEnd:      mpPayment.status === 'approved' ? endDate : null,
        rawWebhook:     mpPayment,
      });

      if (mpPayment.status === 'approved') {
        await _activatePlus(userId, endDate, 'manual');
        sendUpgradePlusEmail(user.email, user.name).catch(console.error);
      }
    }

    // ── Suscripción recurrente (PreApproval) ─────────────────
    if (type === 'subscription_preapproval') {
      const preApproval = new PreApproval(mp);
      const sub = await preApproval.get({ id: data.id });

      const userId = sub.external_reference;
      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      // Guardar/actualizar Subscription
      let subscription = await Subscription.findOne({ userId });

      if (!subscription) {
        subscription = await Subscription.create({
          userId,
          plan:             'plus',
          status:           sub.status === 'authorized' ? 'active' : 'pending',
          mpSubscriptionId: sub.id,
          mpPayerId:        sub.payer_id,
          type:             'recurring',
          startDate:        new Date(),
        });
      } else {
        subscription.mpSubscriptionId = sub.id;
        subscription.status = sub.status === 'authorized' ? 'active'
                            : sub.status === 'cancelled'  ? 'cancelled'
                            : sub.status === 'paused'     ? 'paused'
                            : 'pending';
        await subscription.save();
      }

      if (sub.status === 'authorized') {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        await _activatePlus(userId, endDate, 'recurring');
        sendUpgradePlusEmail(user.email, user.name).catch(console.error);
      }

      // Si se canceló → bajar a Free
      if (sub.status === 'cancelled') {
        await _deactivatePlus(userId);
      }
    }
  } catch (err) {
    console.error('[WEBHOOK MP] Error procesando:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/cancel  (usuario logueado)
// ─────────────────────────────────────────────────────────────
const cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.id });
    if (!subscription || subscription.status !== 'active')
      return res.status(400).json({ message: 'No tenés una suscripción activa' });

    // Si es recurrente, cancelar en MP también
    if (subscription.type === 'recurring' && subscription.mpSubscriptionId) {
      try {
        const preApproval = new PreApproval(mp);
        await preApproval.update({
          id:   subscription.mpSubscriptionId,
          body: { status: 'cancelled' },
        });
      } catch (mpErr) {
        console.error('Error cancelando en MP:', mpErr.message);
        // No bloqueamos — igual marcamos como cancelada localmente
      }
    }

    subscription.status      = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    // El plan baja a free cuando vence el período actual (endDate)
    // Si quieren baja inmediata descomentar la línea siguiente:
    // await _deactivatePlus(req.user.id);

    res.json({ message: 'Suscripción cancelada. Tu plan Plus se mantiene hasta el fin del período actual.' });
  } catch (err) {
    console.error('cancelSubscription error:', err);
    res.status(500).json({ message: 'Error al cancelar suscripción' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/subscriptions/me
// Estado de suscripción del usuario logueado
// ─────────────────────────────────────────────────────────────
const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.id });
    const profile      = await ProviderProfile.findOne({ userId: req.user.id }).select('plan');

    res.json({
      subscription: subscription || null,
      currentPlan:  profile?.plan || 'free',
    });
  } catch (err) {
    console.error('getMySubscription error:', err);
    res.status(500).json({ message: 'Error al obtener suscripción' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/subscriptions/history
// Historial de pagos del usuario logueado
// ─────────────────────────────────────────────────────────────
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await PaymentModel
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(24)
      .select('-rawWebhook'); // no exponer el raw al frontend

    res.json({ payments });
  } catch (err) {
    console.error('getPaymentHistory error:', err);
    res.status(500).json({ message: 'Error al obtener historial' });
  }
};

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────
async function _activatePlus(userId, endDate, type) {
  // 1. Actualizar ProviderProfile → plan: 'plus'
  await ProviderProfile.findOneAndUpdate(
    { userId },
    { plan: 'plus' }
  );

  // 2. Upsert Subscription
  await Subscription.findOneAndUpdate(
    { userId },
    {
      plan:      'plus',
      status:    'active',
      startDate: new Date(),
      endDate,
      type,
    },
    { upsert: true, new: true }
  );
}

async function _deactivatePlus(userId) {
  await ProviderProfile.findOneAndUpdate({ userId }, { plan: 'free' });
  await Subscription.findOneAndUpdate(
    { userId },
    { plan: 'free', status: 'expired' }
  );
}

module.exports = {
  createPreference,
  createRecurring,
  webhook,
  cancelSubscription,
  getMySubscription,
  getPaymentHistory,
};