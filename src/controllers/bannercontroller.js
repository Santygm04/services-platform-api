const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const cloudinary = require('../config/cloudinary');
const BannerAd   = require('../models/bannerad');

// ── Cliente MP ────────────────────────────────────────────
const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ── Precios por posición (ARS/semana) ─────────────────────
const SLOT_PRICES = {
  // Sidebar lateral en resultados de búsqueda
  sidebar_left:   18000,
  sidebar_right:  18000,
  sidebar:        18000,
  // Banner principal en home (arriba del todo)
  home_top:       35000,
  // Notas destacadas home
  home_featured:  28000,
  featured:       28000,
  // Sidebar home derecho
  home_sidebar:   18000,
  // Banner mobile (entre filtros y resultados)
  mobile:         15000,
};

const POSITION_LABELS = {
  sidebar_left:   'Sidebar Lateral Izquierdo (Búsqueda)',
  sidebar_right:  'Sidebar Lateral Derecho (Búsqueda)',
  sidebar:        'Sidebar Lateral (Búsqueda)',
  home_top:       'Banner Principal Home (Top)',
  home_featured:  'Banner Notas Destacadas Home',
  featured:       'Banner Destacado Home',
  home_sidebar:   'Sidebar Home (Derecho)',
  mobile:         'Banner Mobile (Búsqueda)',
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
    for (const pos of Object.keys(SLOT_PRICES)) {
      const positionBanners = pos === 'sidebar'
        ? banners.filter(b => ['sidebar', 'sidebar_left', 'sidebar_right'].includes(b.position))
        : banners.filter(b => b.position === pos);

      if (positionBanners.length > 0) {
        const paid     = positionBanners.filter(b => b.amountPaid > 0);
        const admin    = positionBanners.filter(b => b.amountPaid === 0);
        const rotating = paid.length > 0 ? paid : admin;
        result[pos] = {
          banners:     rotating.map(b => ({ _id: b._id, imageUrl: b.imageUrl, linkUrl: b.linkUrl, title: b.title })),
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
    const now      = new Date();
    const occupied = await BannerAd.find({
      status:     'active',
      startsAt:   { $lte: now },
      endsAt:     { $gte: now },
      amountPaid: { $gt: 0 },
    }).select('position endsAt');

    const availability = {};
    for (const [pos, price] of Object.entries(SLOT_PRICES)) {
      if (pos === 'sidebar') continue;
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
  if (pos === 'sidebar') continue;
  positions[pos] = {
    label:       POSITION_LABELS[pos],
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

    if (!SLOT_PRICES[position]) return res.status(400).json({ message: 'Posición no válida' });
    if (weeks < 1 || weeks > 52) return res.status(400).json({ message: 'Semanas inválidas (1-52)' });

    const pricePerWeek = SLOT_PRICES[position];
    const total        = pricePerWeek * weeks;
    const startsAt     = new Date();
    const endsAt       = new Date();
    endsAt.setDate(endsAt.getDate() + weeks * 7);

    const banner = await BannerAd.create({
      userId: req.user._id,
      position,
      pricePerWeek,
      weeks,
      linkUrl,
      title,
      startsAt,
      endsAt,
      amountPaid: total,
      status:     'pending_payment',
    });

    const preference = new Preference(mp);
    const response   = await preference.create({
      body: {
        items: [{
          id:          `banner-${position}`,
          title:       `Banner ZonaServicios — ${POSITION_LABELS[position]} — ${weeks} sem.`,
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