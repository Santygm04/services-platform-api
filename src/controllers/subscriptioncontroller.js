const { MercadoPagoConfig, Preference, Payment, PreApproval } = require('mercadopago');
const Subscription    = require('../models/subscription');
const PaymentModel    = require('../models/payment');
const ProviderProfile = require('../models/providerprofile');
const User            = require('../models/user');
const { sendPlanUpgradeEmail } = require('../services/emailservice');

// ── Configuración de planes ───────────────────────────────
const PLAN_CONFIG = {
  plus: {
    price: 4,                                       // ← FIX: estaba en 4
    title: 'ZonaServicios Plus — Suscripción mensual',
  },
  premium: {
    price: 10,
    title: 'ZonaServicios Premium — Suscripción mensual',
  },
};

// ── Cliente MP ────────────────────────────────────────────
const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ─────────────────────────────────────────────────────────
// POST /api/subscriptions/create-preference
// ─────────────────────────────────────────────────────────
const createPreference = async (req, res) => {
  try {
    const { plan = 'plus' } = req.body;

    if (!PLAN_CONFIG[plan]) {
      return res.status(400).json({ message: 'Plan inválido. Opciones: plus, premium' });
    }

    const user = await User.findById(req.user.id);
    if (!user)                return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.role !== 'provider') return res.status(403).json({ message: 'Solo los prestadores pueden suscribirse' });

    const cfg = PLAN_CONFIG[plan];

    console.log('BACKEND_URL:', process.env.BACKEND_URL);
    console.log('WEBHOOK URL:', `${process.env.BACKEND_URL}/api/subscriptions/webhook`);

    const preference = new Preference(mp);
    const response   = await preference.create({
      body: {
        items: [
          {
            id:          `${plan}-monthly`,
            title:       cfg.title,
            quantity:    1,
            unit_price:  cfg.price,
            currency_id: 'ARS',
          },
        ],
        payer: { email: user.email, name: user.name },
        // ── FIX: back_urls apuntan al backend (ngrok) ──
        // MP producción no redirige a localhost directamente.
        // El backend recibe el redirect y reenvía al frontend.
        back_urls: {
          success: `${process.env.BACKEND_URL}/api/subscriptions/redirect/success?plan=${plan}`,
          failure: `${process.env.BACKEND_URL}/api/subscriptions/redirect/failure`,
          pending: `${process.env.BACKEND_URL}/api/subscriptions/redirect/pending?plan=${plan}`,
        },
        binary_mode:        true,
        external_reference: `${user._id}|${plan}`,
        notification_url:   `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
        statement_descriptor: 'ZONASERVICIOS',
        expires:              true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to:   new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    });

    res.json({
      preferenceId: response.id,
      initPoint:    response.init_point,
      sandboxUrl:   response.sandbox_init_point,
      plan,
      price:        cfg.price,
    });
  } catch (err) {
    console.error('createPreference error:', err);
    res.status(500).json({ message: 'Error al crear preferencia de pago' });
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/subscriptions/create-recurring
// ─────────────────────────────────────────────────────────
const createRecurring = async (req, res) => {
  try {
    const { plan = 'plus' } = req.body;

    if (!PLAN_CONFIG[plan]) {
      return res.status(400).json({ message: 'Plan inválido. Opciones: plus, premium' });
    }

    const user = await User.findById(req.user.id);
    if (!user)                return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.role !== 'provider') return res.status(403).json({ message: 'Solo los prestadores pueden suscribirse' });

    const cfg = PLAN_CONFIG[plan];

    const preApproval = new PreApproval(mp);
    const response    = await preApproval.create({
      body: {
        reason:     cfg.title,
        auto_recurring: {
          frequency:          1,
          frequency_type:     'months',
          transaction_amount: cfg.price,
          currency_id:        'ARS',
        },
        payer_email:        user.email,
        back_url:           `${process.env.BACKEND_URL}/api/subscriptions/redirect/success?plan=${plan}`,
        external_reference: `${user._id}|${plan}`,
        notification_url:   `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
        status:             'pending',
      },
    });

    res.json({
      subscriptionId: response.id,
      initPoint:      response.init_point,
      plan,
      price:          cfg.price,
    });
  } catch (err) {
    console.error('createRecurring error:', err);
    res.status(500).json({ message: 'Error al crear suscripción recurrente' });
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/subscriptions/webhook  (sin auth — llamado por MP)
// ─────────────────────────────────────────────────────────
const webhook = async (req, res) => {
  // Siempre 200 primero — MP necesita respuesta inmediata
  res.sendStatus(200);

  try {
    // ── FIX: MP puede mandar datos por body O por query params ──
    const type =
    req.body?.type ||
    req.query?.type ||
    req.query?.topic; 
    const dataId =
    req.body?.data?.id ||
    req.query?.['data.id'] ||
    req.query?.id ||
    req.query?.resource?.split('/').pop(); 

    console.log('🔥 WEBHOOK body:', JSON.stringify(req.body));
    console.log('🔥 WEBHOOK query:', JSON.stringify(req.query));
    console.log(`[WEBHOOK MP] type=${type} id=${dataId}`);

    if (!type || !dataId) {
      console.log('[WEBHOOK MP] Sin type o id — ignorando');
      return;
    }

    // ── Pago único ───────────────────────────────────────
    if (type === 'payment') {
      const paymentClient = new Payment(mp);
      const mpPayment     = await paymentClient.get({ id: dataId });

      if (!mpPayment) {
        console.log('[WEBHOOK MP] No se encontró el pago en MP');
        return;
      }

      if (!mpPayment.external_reference) {
        console.log('[WEBHOOK MP] Sin external_reference');
        return;
      }

        const parts = mpPayment.external_reference.split('|');

        const userId = parts[0];
        const plan   = parts[1] || 'plus';

        if (!userId) {
        console.log('[WEBHOOK MP] userId inválido');
        return;
      }     

      const user = await User.findById(userId);
      if (!user)  return;

      // Idempotencia
      const existing = await PaymentModel.findOne({ mpPaymentId: String(mpPayment.id) });
      if (existing) {
        console.log(`[WEBHOOK MP] Pago ${mpPayment.id} ya procesado — ignorando`);
        return;
      }

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
        planActivated:  mpPayment.status === 'approved' ? plan : null,
        periodStart:    mpPayment.status === 'approved' ? now     : null,
        periodEnd:      mpPayment.status === 'approved' ? endDate : null,
        rawWebhook:     mpPayment,
      });

      console.log(`[WEBHOOK MP] Pago status=${mpPayment.status} plan=${plan} userId=${userId}`);

      if (String(mpPayment.status) === 'approved') {
        await _activatePlan(userId, plan, endDate, 'manual');
        console.log(`✅ [WEBHOOK MP] Plan ${plan} activado para userId=${userId}`);
        sendPlanUpgradeEmail(user.email, user.name, plan, endDate).catch(console.error);
      }
    }

    // ── Suscripción recurrente ───────────────────────────
    if (type === 'subscription_preapproval') {
      const preApproval = new PreApproval(mp);
      const sub         = await preApproval.get({ id: dataId });

      if (!sub) return;

      const [userId, plan = 'plus'] = (sub.external_reference || '').split('|');
      if (!userId) return;

      const user = await User.findById(userId);
      if (!user)  return;

      let subscription = await Subscription.findOne({ userId });

      if (!subscription) {
        subscription = await Subscription.create({
          userId,
          plan,
          status:           sub.status === 'authorized' ? 'active' : 'pending',
          mpSubscriptionId: sub.id,
          mpPayerId:        sub.payer_id,
          type:             'recurring',
          startDate:        new Date(),
        });
      } else {
        subscription.mpSubscriptionId = sub.id;
        subscription.plan   = plan;
        subscription.status =
          sub.status === 'authorized' ? 'active'    :
          sub.status === 'cancelled'  ? 'cancelled' :
          sub.status === 'paused'     ? 'paused'    : 'pending';
        await subscription.save();
      }

      console.log(`[WEBHOOK MP] PreApproval status=${sub.status} plan=${plan} userId=${userId}`);

      if (sub.status === 'authorized') {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        await _activatePlan(userId, plan, endDate, 'recurring');
        console.log(`✅ [WEBHOOK MP] Plan ${plan} activado (recurring) para userId=${userId}`);
        sendPlanUpgradeEmail(user.email, user.name, plan, endDate).catch(console.error);
      }

      if (sub.status === 'cancelled') {
        await _deactivatePlan(userId);
        console.log(`[WEBHOOK MP] Plan desactivado para userId=${userId}`);
      }
    }
  } catch (err) {
    console.error('[WEBHOOK MP] Error:', err.message, err.stack);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/subscriptions/cancel
// ─────────────────────────────────────────────────────────
const cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.id });
    if (!subscription || subscription.status !== 'active')
      return res.status(400).json({ message: 'No tenés una suscripción activa' });

    if (subscription.type === 'recurring' && subscription.mpSubscriptionId) {
      try {
        const preApproval = new PreApproval(mp);
        await preApproval.update({
          id:   subscription.mpSubscriptionId,
          body: { status: 'cancelled' },
        });
      } catch (mpErr) {
        console.error('Error cancelando en MP:', mpErr.message);
      }
    }

    subscription.status      = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    res.json({ message: 'Suscripción cancelada. Tu plan se mantiene hasta el fin del período actual.' });
  } catch (err) {
    console.error('cancelSubscription error:', err);
    res.status(500).json({ message: 'Error al cancelar suscripción' });
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/subscriptions/me
// ─────────────────────────────────────────────────────────
const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.id });
    const profile      = await ProviderProfile.findOne({ userId: req.user.id })
      .select('plan planExpiresAt badges');

    res.json({
      subscription:  subscription || null,
      currentPlan:   profile?.plan         || 'free',
      planExpiresAt: profile?.planExpiresAt || null,
      badges:        profile?.badges        || [],
    });
  } catch (err) {
    console.error('getMySubscription error:', err);
    res.status(500).json({ message: 'Error al obtener suscripción' });
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/subscriptions/history
// ─────────────────────────────────────────────────────────
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await PaymentModel
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(24)
      .select('-rawWebhook');

    res.json({ payments });
  } catch (err) {
    console.error('getPaymentHistory error:', err);
    res.status(500).json({ message: 'Error al obtener historial' });
  }
};

// ─────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────
async function _activatePlan(userId, plan, endDate, type) {
  await ProviderProfile.findOneAndUpdate(
    { userId },
    { plan, planExpiresAt: endDate }
  );
  await Subscription.findOneAndUpdate(
    { userId },
    { plan, status: 'active', startDate: new Date(), endDate, type },
    { upsert: true, new: true }
  );
}

async function _deactivatePlan(userId) {
  await ProviderProfile.findOneAndUpdate(
    { userId },
    { plan: 'free', planExpiresAt: null }
  );
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