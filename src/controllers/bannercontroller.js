const cloudinary = require('../config/cloudinary');
const mercadopago = require('mercadopago');
const BannerAd = require('../models/bannerad');

// ── Precios por posición (ARS/semana) ─────────────────────
// Deben coincidir con bannerad.js BANNER_POSITIONS
const SLOT_PRICES = {
  sidebar_left:  2999,
  sidebar_right: 2999,
  home_sidebar:  3999,
  mobile:        1999,
  featured:      5999,
  // retrocompatibilidad: 'sidebar' antiguo → trata como sidebar_left
  sidebar:       2999,
};

const POSITION_LABELS = {
  sidebar_left:  'Sidebar Izquierdo (Búsqueda)',
  sidebar_right: 'Sidebar Derecho (Búsqueda)',
  home_sidebar:  'Sidebar Home',
  mobile:        'Banner Mobile (Búsqueda)',
  featured:      'Banner Destacado Home (Top)',
  sidebar:       'Sidebar (Legacy)',
};

// ── Helper: subir buffer a Cloudinary ────────────────────
const uploadToCloudinary = (fileBuffer, folder, publicId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'image', overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(fileBuffer);
  });

// ── GET /api/banners/active ───────────────────────────────
// Público — devuelve banners activos por posición (o default si no hay)
const getActiveBanners = async (req, res) => {
  try {
    const now = new Date();

    const banners = await BannerAd.find({
      status:   'active',
      startsAt: { $lte: now },
      endsAt:   { $gte: now },
      imageUrl: { $exists: true, $ne: null, $ne: '' },
    })
      .populate('userId', 'name')
      .sort({ startsAt: -1 });

    // Todas las posiciones válidas (incluyendo 'sidebar' legacy)
    const positions = Object.keys(SLOT_PRICES);
    const result = {};

    for (const pos of positions) {
      // Banners de esta posición
      // 'sidebar' legacy: matchea tanto 'sidebar' como 'sidebar_left'/'sidebar_right'
      const positionBanners = pos === 'sidebar'
        ? banners.filter(b => b.position === 'sidebar' || b.position === 'sidebar_left' || b.position === 'sidebar_right')
        : banners.filter(b => b.position === pos);

      if (positionBanners.length > 0) {
        const paidBanners  = positionBanners.filter(b => b.amountPaid > 0);
        const adminBanners = positionBanners.filter(b => b.amountPaid === 0);

        // Pagados tienen prioridad; si no hay pagados, se usan los del admin
        const rotatingBanners = paidBanners.length > 0 ? paidBanners : adminBanners;

        result[pos] = {
          banners: rotatingBanners.map(b => ({
            _id:      b._id,
            imageUrl: b.imageUrl,
            linkUrl:  b.linkUrl,
            title:    b.title,
          })),
          isDefault:   false,
          totalActive: paidBanners.length,
        };
      } else {
        // Sin banner activo → null (el frontend usa su placeholder)
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
// Público — precios y disponibilidad por posición
const getBannerPrices = async (req, res) => {
  try {
    const now = new Date();

    // Banners PAGOS activos (para calcular disponibilidad)
    const occupied = await BannerAd.find({
      status:     'active',
      startsAt:   { $lte: now },
      endsAt:     { $gte: now },
      amountPaid: { $gt: 0 },
    }).select('position endsAt amountPaid');

    const availability = {};

    for (const [pos, price] of Object.entries(SLOT_PRICES)) {
      if (pos === 'sidebar') continue; // no exponer posición legacy en precios

      // Buscar si la posición está ocupada
      const slot = occupied.find(b => b.position === pos);

      availability[pos] = {
        label:         POSITION_LABELS[pos],
        pricePerWeek:  price,
        available:     !slot,
        occupiedUntil: slot ? slot.endsAt : null,
      };
    }

    res.json({ prices: SLOT_PRICES, availability });
  } catch (error) {
    console.error('getBannerPrices error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/banners/checkout ────────────────────────────
// Prestador logueado — crea preferencia MP para comprar banner
const createBannerCheckout = async (req, res) => {
  try {
    const { weeks = 1, position = 'sidebar_left', linkUrl = '', title = '' } = req.body;

    if (!SLOT_PRICES[position]) {
      return res.status(400).json({
        message: `Posición de banner no válida. Opciones: ${Object.keys(SLOT_PRICES).filter(p => p !== 'sidebar').join(', ')}`,
      });
    }

    if (weeks < 1 || weeks > 12) {
      return res.status(400).json({ message: 'Número de semanas inválido (1-12)' });
    }

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
      amountPaid:   total,
      status:       'pending_payment',
    });

    const preference = await mercadopago.preferences.create({
      items: [
        {
          title:       `Banner ZonaServicios — ${POSITION_LABELS[position]} — ${weeks} sem.`,
          unit_price:  total,
          quantity:    1,
          currency_id: 'ARS',
        },
      ],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/banner/success?bannerId=${banner._id}`,
        failure: `${process.env.FRONTEND_URL}/banner/failure`,
        pending: `${process.env.FRONTEND_URL}/banner/pending?bannerId=${banner._id}`,
      },
      auto_return:       'approved',
      notification_url:  `${process.env.BACKEND_URL}/api/banners/webhook`,
      external_reference: banner._id.toString(),
      metadata:           { bannerId: banner._id.toString() },
    });

    await BannerAd.findByIdAndUpdate(banner._id, {
      mpPreferenceId: preference.body.id,
    });

    res.json({
      preferenceId: preference.body.id,
      initPoint:    preference.body.init_point,
      bannerId:     banner._id,
      total,
      position,
      pricePerWeek,
    });
  } catch (error) {
    console.error('createBannerCheckout error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/banners/webhook ─────────────────────────────
const bannerWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    const { type, data } = req.body;
    if (type !== 'payment' || !data?.id) return;

    const payment = await mercadopago.payment.findById(data.id);
    if (!payment?.body) return;

    const { status, external_reference, id: mpId } = payment.body;
    if (status !== 'approved' || !external_reference) return;

    // Idempotencia
    const existing = await BannerAd.findOne({ mpPaymentId: String(mpId) });
    if (existing) return;

    await BannerAd.findByIdAndUpdate(external_reference, {
      status:      'active',
      mpPaymentId: String(mpId),
    });
  } catch (err) {
    console.error('bannerWebhook error:', err);
  }
};

// ── POST /api/banners/:id/upload-image ────────────────────
// Prestador sube imagen de SU banner (después de pagar)
const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    const banner = await BannerAd.findOne({ _id: req.params.id, userId: req.user._id });
    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });

    const publicId = `banner_${banner._id}_${Date.now()}`;
    const result   = await uploadToCloudinary(req.file.buffer, 'zonaservicios/banners', publicId);

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

// ── ADMIN: GET /api/admin/banners ─────────────────────────
const adminListBanners = async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20, position } = req.query;
    const filter = {};
    if (status !== 'all')  filter.status   = status;
    if (position)          filter.position  = position;

    const skip = (page - 1) * limit;

    const [banners, total] = await Promise.all([
      BannerAd.find(filter)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      BannerAd.countDocuments(filter),
    ]);

    res.json({ banners, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('adminListBanners error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: POST /api/admin/banners ────────────────────────
// Admin crea banner sin pago (arranca como 'active' directo)
const adminCreateBanner = async (req, res) => {
  try {
    const {
      position   = 'sidebar_left',
      linkUrl    = '',
      title      = '',
      weeks      = 4,
      adminNotes = '',
    } = req.body;

    if (!SLOT_PRICES[position]) {
      return res.status(400).json({ message: 'Posición no válida' });
    }

    const startsAt = new Date();
    const endsAt   = new Date();
    endsAt.setDate(endsAt.getDate() + weeks * 7);

    const banner = await BannerAd.create({
      userId:      req.user._id,   // el admin mismo como owner
      position,
      pricePerWeek: 0,
      weeks,
      linkUrl,
      title,
      startsAt,
      endsAt,
      amountPaid:  0,              // sin pago → admin banner
      status:      'active',
      adminNotes,
    });

    res.status(201).json({ message: 'Banner creado', banner });
  } catch (error) {
    console.error('adminCreateBanner error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: PATCH /api/admin/banners/:id ───────────────────
const adminUpdateBanner = async (req, res) => {
  try {
    const { status, linkUrl, title, adminNotes, imageUrl, position, weeks } = req.body;
    const updates = {};

    if (status     !== undefined) updates.status     = status;
    if (linkUrl    !== undefined) updates.linkUrl    = linkUrl;
    if (title      !== undefined) updates.title      = title;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (imageUrl   !== undefined) updates.imageUrl   = imageUrl;
    if (position   !== undefined) {
      if (!SLOT_PRICES[position]) {
        return res.status(400).json({ message: 'Posición no válida' });
      }
      updates.position    = position;
      updates.pricePerWeek = SLOT_PRICES[position];
    }
    if (weeks !== undefined) {
      if (weeks < 1 || weeks > 52) {
        return res.status(400).json({ message: 'Semanas inválidas (1-52)' });
      }
      const banner = await BannerAd.findById(req.params.id);
      if (banner) {
        const endsAt = new Date(banner.startsAt);
        endsAt.setDate(endsAt.getDate() + weeks * 7);
        updates.weeks  = weeks;
        updates.endsAt = endsAt;
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

// ── ADMIN: POST /api/admin/banners/:id/upload-image ───────
// Imagen se guarda en Cloudinary (no en disco)
const adminUploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    const banner = await BannerAd.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });

    const publicId = `banner_admin_${banner._id}_${Date.now()}`;
    const result   = await uploadToCloudinary(req.file.buffer, 'zonaservicios/banners', publicId);

    banner.imageUrl = result.secure_url;
    await banner.save();

    res.json({ message: 'Imagen actualizada', imageUrl: banner.imageUrl });
  } catch (error) {
    console.error('adminUploadBannerImage error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: DELETE /api/admin/banners/:id ──────────────────
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

// ── Cron helper — expirar banners vencidos ────────────────
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