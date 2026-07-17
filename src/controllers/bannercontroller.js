const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const cloudinary  = require('../config/cloudinary');
const BannerAd    = require('../models/bannerad');
const SiteConfig  = require('../models/siteconfig');

// ── Cliente MP ────────────────────────────────────────────
const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ── Posiciones válidas (fijas) — el PRECIO de cada una ahora vive en SiteConfig ──
const SLOT_KEYS = ['sidebar', 'home_top', 'home_featured', 'home_bottom', 'profile_sidebar'];
// Fallback por si SiteConfig no está inicializada todavía
const DEFAULT_SLOT_PRICES = {
  sidebar: 18000, home_top: 35000, home_featured: 28000, home_bottom: 20000, profile_sidebar: 18000,
};

// Devuelve el objeto de precios reales, mezclando con los defaults
const getSlotPrices = async () => {
  const cfg = await SiteConfig.getSingleton();
  return { ...DEFAULT_SLOT_PRICES, ...(cfg.bannerPrices || {}) };
};

const POSITION_LABELS = {
  sidebar:         'Sidebar Búsquedas (Ambos lados)',
  home_top:        'Banner Principal Home (Top)',
  home_featured:   'Banner Notas Destacadas Home',
  home_bottom:     'Banner Inferior Home',
  profile_sidebar: 'Laterales Perfiles Buscador/Prestador',
};

// Busca la oferta/promo activa que aplique a una posición (o global, position:'')
const getActiveOfferForPosition = async (position) => {
  const cfg = await SiteConfig.getSingleton();
  const offers = cfg.offers || [];
  return offers.find(o =>
    o.active &&
    (!o.position || o.position === position) &&
    o.discountType && o.discountType !== 'none'
  ) || null;
};

const uploadToCloudinary = (fileBuffer, folder, publicId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'image', overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(fileBuffer);
  });

// ── GET /api/banners/active ───────────────────────────────
const getActiveBanners = async (req, res) => {
  try {
    const now     = new Date();
    const banners = await BannerAd.find({
      status:   'active',
      startsAt: { $lte: now },
      endsAt:   { $gte: now },
      imageUrl: { $exists: true, $ne: null, $ne: '' },
    }).populate('userId', 'name').sort({ startsAt: -1 });

    const result = {};
    for (const pos of SLOT_KEYS) {
      const positionBanners =
        pos === 'home_featured'
          ? banners.filter(b => b.position === 'home_featured' || b.position === 'featured')
          : pos === 'sidebar'
          ? banners.filter(b => b.position === 'sidebar' || b.position === 'sidebar_left' || b.position === 'sidebar_right')
          : banners.filter(b => b.position === pos);

      if (positionBanners.length > 0) {
        const paid  = positionBanners.filter(b => b.amountPaid > 0);
        const admin = positionBanners.filter(b => b.amountPaid === 0);
        const pool  = paid.length > 0 ? paid : admin;

        // ── Ordenar por plan del dueño del banner ──
        // Para cada banner necesitamos saber el plan del usuario
        // Los populate ya tienen userId, pero aquí solo tenemos el userId como ObjectId
        // Así que ordenamos: premium > plus > free según amountPaid como proxy
        // (los banners de premium pagan más)
        // La rotación real se hace en el frontend con el ROTATE_INTERVAL

        // Primero buscamos el plan de cada usuario de los banners
        const User = require('../models/User');
        const ProviderProfile = require('../models/ProviderProfile');

        const withPlan = await Promise.all(pool.map(async (b) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: b.userId }).select('plan').lean();
    return { banner: b, plan: profile?.plan || 'free' };
  } catch {
    return { banner: b, plan: 'free' };
  }
}));

// Agrupar por plan respetando orden premium > plus > free
const planOrder = { premium: 0, plus: 1, free: 2 };
const groups = { premium: [], plus: [], free: [] };
withPlan.forEach(({ banner, plan }) => {
  const key = planOrder[plan] !== undefined ? plan : 'free';
  groups[key].push(banner);
});

// Rotar dentro de cada grupo cada 30 min
const rotationSlot = Math.floor(Date.now() / (30 * 60 * 1000));
const rotateArr = (arr) => {
  if (arr.length <= 1) return arr;
  const offset = rotationSlot % arr.length;
  return [...arr.slice(offset), ...arr.slice(0, offset)];
};

const sorted = [
  ...rotateArr(groups.premium),
  ...rotateArr(groups.plus),
  ...rotateArr(groups.free),
].map(b => ({ _id: b._id, imageUrl: b.imageUrl, linkUrl: b.linkUrl, title: b.title }));

        result[pos] = {
          banners:     sorted,
          isDefault:   false,
          totalActive: paid.length,
        };
      } else {
        result[pos] = null;
      }
    }

    res.json({ banners: result });
  } catch (error) {
    console.error('getActiveBanners error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/banners/prices ───────────────────────────────
const getBannerPrices = async (req, res) => {
  try {
    const SLOT_PRICES = await getSlotPrices();
    const now      = new Date();
    const occupied = await BannerAd.find({
      status:     'active',
      startsAt:   { $lte: now },
      endsAt:     { $gte: now },
      amountPaid: { $gt: 0 },
    }).select('position endsAt');

    const availability = {};
    for (const [pos, price] of Object.entries(SLOT_PRICES)) {
    const slot = occupied.find(b => b.position === pos);
      availability[pos] = {
        label:         POSITION_LABELS[pos],
        pricePerWeek:  price,
        available:     !slot,
        occupiedUntil: slot ? slot.endsAt : null,
      };
    }

    const positions = {};
  for (const [pos, price] of Object.entries(SLOT_PRICES)) {
  positions[pos] = {
    label: POSITION_LABELS[pos],
    pricePerWeek: price,
  };
}
res.json({ prices: SLOT_PRICES, positions, availability });
  } catch (error) {
    console.error('getBannerPrices error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/banners/checkout ────────────────────────────
const createBannerCheckout = async (req, res) => {
  try {
    const { weeks = 1, position = 'sidebar_left', linkUrl = '', title = '' } = req.body;
    const SLOT_PRICES = await getSlotPrices();

    if (!SLOT_PRICES[position]) return res.status(400).json({ message: 'Posición no válida' });
    if (weeks < 1 || weeks > 52) return res.status(400).json({ message: 'Semanas inválidas (1-52)' });

    const pricePerWeek = SLOT_PRICES[position];

    // ── Promo activa para esta posición ──
    const offer = await getActiveOfferForPosition(position);
    let contractWeeks  = weeks; // semanas que realmente queda activo el banner
    let total          = pricePerWeek * weeks;
    let discountLabel  = '';

    if (offer?.discountType === 'percent' && offer.discountValue > 0) {
      total = Math.round(total * (1 - offer.discountValue / 100));
      discountLabel = ` (-${offer.discountValue}%)`;
    } else if (offer?.discountType === 'weeks2x1') {
      contractWeeks = weeks * 2; // paga weeks, dura el doble
      discountLabel = ' (2x1)';
    } else if (offer?.discountType === 'free') {
      total = 0;
      discountLabel = ' (GRATIS)';
    }

    const startsAt = new Date();
    const endsAt   = new Date();
    endsAt.setDate(endsAt.getDate() + contractWeeks * 7);

    const banner = await BannerAd.create({
      userId: req.user._id,
      position,
      pricePerWeek,
      weeks: contractWeeks,
      linkUrl,
      title,
      startsAt,
      endsAt,
      amountPaid: total,
      status:     total === 0 ? 'active' : 'pending_payment',
    });

    // ── Oferta 100% gratis: no hay nada que cobrar, MP no acepta unit_price 0 ──
    if (total === 0) {
      return res.json({
        free: true,
        bannerId: banner._id,
        total: 0,
        position,
        pricePerWeek,
        weeks: contractWeeks,
      });
    }

    const preference = new Preference(mp);
    const response   = await preference.create({
      body: {
        items: [{
          id:          `banner-${position}`,
          title:       `Banner ZonaServicios — ${POSITION_LABELS[position]} — ${contractWeeks} sem.${discountLabel}`,
          unit_price:  total,
          quantity:    1,
          currency_id: 'ARS',
        }],
        // ── FIX: back_urls apuntan al backend (ngrok) ──
        back_urls: {
          success: `${process.env.BACKEND_URL}/api/banners/redirect/success?bannerId=${banner._id}`,
          failure: `${process.env.BACKEND_URL}/api/banners/redirect/failure`,
          pending: `${process.env.BACKEND_URL}/api/banners/redirect/pending?bannerId=${banner._id}`,
        },
        binary_mode:        true,
        notification_url:   `${process.env.BACKEND_URL}/api/banners/webhook`,
        external_reference: banner._id.toString(),
      },
    });

    await BannerAd.findByIdAndUpdate(banner._id, { mpPreferenceId: response.id });

    res.json({
      preferenceId: response.id,
      initPoint:    response.init_point,
      bannerId:     banner._id,
      total,
      position,
      pricePerWeek,
      weeks: contractWeeks,
    });
  } catch (error) {
    console.error('createBannerCheckout error:', error);
    res.status(500).json({ message: 'Error al crear preferencia de pago' });
  }
};

// ── POST /api/banners/webhook ─────────────────────────────
const bannerWebhook = async (req, res) => {
  // Siempre 200 primero
  res.sendStatus(200);

  try {
    // ── FIX: MP puede mandar por body O por query params ──
    const type   = req.body?.type     || req.query?.type;
    const dataId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;

    console.log('🔥 BANNER WEBHOOK body:', JSON.stringify(req.body));
    console.log('🔥 BANNER WEBHOOK query:', JSON.stringify(req.query));
    console.log(`[BANNER WEBHOOK] type=${type} id=${dataId}`);

    if (type !== 'payment' || !dataId) return;

    const paymentClient = new Payment(mp);
    const payment       = await paymentClient.get({ id: dataId });

    if (!payment) return;

    const { status, external_reference, id: mpId } = payment;

    console.log(`[BANNER WEBHOOK] status=${status} bannerId=${external_reference}`);

    if (status !== 'approved' || !external_reference) return;

    // Idempotencia
    const existing = await BannerAd.findOne({ mpPaymentId: String(mpId) });
    if (existing) {
      console.log(`[BANNER WEBHOOK] Pago ${mpId} ya procesado — ignorando`);
      return;
    }

    await BannerAd.findByIdAndUpdate(external_reference, {
      status:      'active',
      mpPaymentId: String(mpId),
    });

    console.log(`✅ [BANNER WEBHOOK] Banner ${external_reference} activado`);
  } catch (err) {
    console.error('bannerWebhook error:', err);
  }
};

// ── POST /api/banners/:id/upload-image ────────────────────
const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });
    const banner = await BannerAd.findOne({ _id: req.params.id, userId: req.user._id });
    if (!banner)  return res.status(404).json({ message: 'Banner no encontrado' });

    const result = await uploadToCloudinary(
      req.file.buffer,
      'zonaservicios/banners',
      `banner_${banner._id}_${Date.now()}`
    );
    banner.imageUrl = result.secure_url;
    await banner.save();

    res.json({ message: 'Imagen subida', imageUrl: banner.imageUrl });
  } catch (error) {
    console.error('uploadBannerImage error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/banners/my ───────────────────────────────────
const getMyBanners = async (req, res) => {
  try {
    const banners = await BannerAd.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ banners });
  } catch (error) {
    console.error('getMyBanners error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: GET ────────────────────────────────────────────
const adminListBanners = async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20, position } = req.query;
    const filter = {};
    if (status !== 'all') filter.status   = status;
    if (position)         filter.position = position;

    const [banners, total] = await Promise.all([
      BannerAd.find(filter)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      BannerAd.countDocuments(filter),
    ]);

    res.json({ banners, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('adminListBanners error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: POST ───────────────────────────────────────────
const adminCreateBanner = async (req, res) => {
  try {
    const { position = 'sidebar_left', linkUrl = '', title = '', weeks = 4, adminNotes = '' } = req.body;
    const SLOT_PRICES = await getSlotPrices();
    if (!SLOT_PRICES[position]) return res.status(400).json({ message: 'Posición no válida' });

    const startsAt = new Date();
    const endsAt   = new Date();
    endsAt.setDate(endsAt.getDate() + weeks * 7);

    const banner = await BannerAd.create({
      userId: req.user._id,
      position,
      pricePerWeek: 0,
      weeks,
      linkUrl,
      title,
      startsAt,
      endsAt,
      amountPaid: 0,
      status:     'active',
      adminNotes,
    });

    res.status(201).json({ message: 'Banner creado', banner });
  } catch (error) {
    console.error('adminCreateBanner error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: PATCH ──────────────────────────────────────────
const adminUpdateBanner = async (req, res) => {
  try {
    const { status, linkUrl, title, adminNotes, imageUrl, position, weeks } = req.body;
    const updates = {};

    if (status     !== undefined) updates.status     = status;
    if (linkUrl    !== undefined) updates.linkUrl    = linkUrl;
    if (title      !== undefined) updates.title      = title;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (imageUrl   !== undefined) updates.imageUrl   = imageUrl;

    if (position !== undefined) {
      const SLOT_PRICES = await getSlotPrices();
      if (!SLOT_PRICES[position]) return res.status(400).json({ message: 'Posición no válida' });
      updates.position    = position;
      updates.pricePerWeek = SLOT_PRICES[position];
    }

    if (weeks !== undefined) {
      const b = await BannerAd.findById(req.params.id);
      if (b) {
        const e = new Date(b.startsAt);
        e.setDate(e.getDate() + weeks * 7);
        updates.weeks  = weeks;
        updates.endsAt = e;
      }
    }

    const banner = await BannerAd.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('userId', 'name email');

    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });

    res.json({ banner });
  } catch (error) {
    console.error('adminUpdateBanner error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: POST upload-image ──────────────────────────────
const adminUploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });
    const banner = await BannerAd.findById(req.params.id);
    if (!banner)  return res.status(404).json({ message: 'Banner no encontrado' });

    const result = await uploadToCloudinary(
      req.file.buffer,
      'zonaservicios/banners',
      `banner_admin_${banner._id}_${Date.now()}`
    );
    banner.imageUrl = result.secure_url;
    await banner.save();

    res.json({ message: 'Imagen actualizada', imageUrl: banner.imageUrl });
  } catch (error) {
    console.error('adminUploadBannerImage error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: DELETE ─────────────────────────────────────────
const adminDeleteBanner = async (req, res) => {
  try {
    const banner = await BannerAd.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });
    res.json({ message: 'Banner eliminado' });
  } catch (error) {
    console.error('adminDeleteBanner error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── Cron helper ───────────────────────────────────────────
const expireBanners = async () => {
  try {
    const result = await BannerAd.updateMany(
      { status: 'active', endsAt: { $lt: new Date() } },
      { status: 'expired' }
    );
    if (result.modifiedCount > 0) {
      console.log(`[Banners] ${result.modifiedCount} banners expirados`);
    }
  } catch (err) {
    console.error('expireBanners error:', err);
  }
};

module.exports = {
  getActiveBanners,
  getBannerPrices,
  createBannerCheckout,
  bannerWebhook,
  uploadBannerImage,
  getMyBanners,
  adminCreateBanner,
  adminListBanners,
  adminUpdateBanner,
  adminUploadBannerImage,
  adminDeleteBanner,
  expireBanners,
};