const path = require('path');
const fs = require('fs');
const mercadopago = require('mercadopago');
const BannerAd = require('../models/bannerad');

// Precio por semana por posición (ARS)
const SLOT_PRICES = {
  sidebar: 2999,
};

// Banner predeterminado cuando no hay publicidad paga
const DEFAULT_BANNERS = {
  sidebar: {
    imageUrl: '/uploads/defaults/banner-sidebar-default.jpg',
    linkUrl: '/',
    title: 'ZonaServicios — Encontrá tu profesional',
    isDefault: true,
  },
};

// ── GET /api/banners/active ───────────────────────────────
// Público — devuelve el banner activo por posición (o el default)
const getActiveBanners = async (req, res) => {
  try {
    const now = new Date();

    // Busca TODOS los banners activos y vigentes
    const banners = await BannerAd.find({
      status: 'active',
      startsAt: { $lte: now },
      endsAt:   { $gte: now },
      imageUrl: { $exists: true, $ne: null, $ne: '' },
    })
      .populate('userId', 'name')
      .sort({ startsAt: -1 });

    const positions = ['sidebar'];
    const result = {};

    for (const pos of positions) {
      // Filtrar banners de esta posición
      // Incluir banners de la posición correcta + los que no tienen posición definida
      const positionBanners = banners.filter(b => b.position === pos || !b.position);

      if (positionBanners.length > 0) {
        // Separar pagos (amountPaid > 0) de los del admin (amountPaid === 0)
        const paidBanners = positionBanners.filter(b => b.amountPaid > 0);
        const adminBanners = positionBanners.filter(b => b.amountPaid === 0);

        // DESPUÉS
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
        result[pos] = DEFAULT_BANNERS[pos] || null;
      }
    }

    res.json({ banners: result });
  } catch (error) {
    console.error('getActiveBanners error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
// ── GET /api/banners/prices ───────────────────────────────
// Público — devuelve precios y disponibilidad por posición
const getBannerPrices = async (req, res) => {
  try {
    const now = new Date();

    // Ver si cada posición está ocupada
    // Solo contar como "ocupado" los banners PAGOS (no los del admin)
    const occupied = await BannerAd.find({
      status: 'active',
      startsAt: { $lte: now },
      endsAt:   { $gte: now },
      amountPaid: { $gt: 0 },
    }).select('position endsAt amountPaid');

    const availability = {};
    for (const [pos, price] of Object.entries(SLOT_PRICES)) {
      const slot = occupied.find((b) => b.position === pos);
      availability[pos] = {
        pricePerWeek: price,
        available:    !slot,
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
    const { weeks = 1, position = 'sidebar', linkUrl = '', title = '' } = req.body;

    if (!SLOT_PRICES[position]) {
      return res.status(400).json({ message: 'Posición de banner no válida' });
    }
    if (weeks < 1 || weeks > 12) {
      return res.status(400).json({ message: 'Número de semanas inválido (1-12)' });
    }

    const total = SLOT_PRICES[position] * weeks;
    const startsAt = new Date();
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + weeks * 7);

    // Crear el BannerAd en estado pending
    const banner = await BannerAd.create({
      userId:    req.user._id,
      position,
      weeks,
      linkUrl,
      title,
      startsAt,
      endsAt,
      amountPaid: total,
      status:    'pending_payment',
    });

    // Crear preferencia MP
    const preference = await mercadopago.preferences.create({
      items: [
        {
          title:      `Banner publicitario ZonaServicios — ${weeks} semana${weeks > 1 ? 's' : ''}`,
          unit_price: total,
          quantity:   1,
          currency_id: 'ARS',
        },
      ],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/banner/success?bannerId=${banner._id}`,
        failure: `${process.env.FRONTEND_URL}/banner/failure`,
        pending: `${process.env.FRONTEND_URL}/banner/pending?bannerId=${banner._id}`,
      },
      auto_return: 'approved',
      notification_url: `${process.env.BACKEND_URL}/api/banners/webhook`,
      external_reference: banner._id.toString(),
      metadata: { bannerId: banner._id.toString() },
    });

    await BannerAd.findByIdAndUpdate(banner._id, {
      mpPreferenceId: preference.body.id,
    });

    res.json({
      preferenceId: preference.body.id,
      initPoint:    preference.body.init_point,
      bannerId:     banner._id,
      total,
    });
  } catch (error) {
    console.error('createBannerCheckout error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/banners/webhook ─────────────────────────────
const bannerWebhook = async (req, res) => {
  res.sendStatus(200); // Responder inmediato

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
// Subir imagen del banner (el comprador, después de pagar)
const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se recibió ningún archivo' });
    }

    const banner = await BannerAd.findOne({
      _id:    req.params.id,
      userId: req.user._id,
    });

    if (!banner) {
      return res.status(404).json({ message: 'Banner no encontrado' });
    }

    // Borrar imagen anterior si existe y no es la default
    if (banner.imageUrl && !banner.imageUrl.includes('defaults')) {
      const oldPath = path.join(__dirname, '../../', banner.imageUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    banner.imageUrl = `/uploads/banners/${req.file.filename}`;
    await banner.save();

    res.json({ message: 'Imagen subida', imageUrl: banner.imageUrl });
  } catch (error) {
    console.error('uploadBannerImage error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/banners/my ───────────────────────────────────
// Historial de banners del prestador logueado
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
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const filter = status === 'all' ? {} : { status };
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

// ── ADMIN: PATCH /api/admin/banners/:id ───────────────────
// Admin puede cambiar status, imageUrl, linkUrl, notas
const adminUpdateBanner = async (req, res) => {
  try {
    const { status, linkUrl, title, adminNotes, imageUrl } = req.body;
    const updates = {};
    if (status)     updates.status     = status;
    if (linkUrl !== undefined) updates.linkUrl = linkUrl;
    if (title !== undefined)  updates.title   = title;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (imageUrl)   updates.imageUrl   = imageUrl;

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
const adminUploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    const banner = await BannerAd.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner no encontrado' });

    if (banner.imageUrl && !banner.imageUrl.includes('defaults')) {
      const oldPath = path.join(__dirname, '../../', banner.imageUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    banner.imageUrl = `/uploads/banners/${req.file.filename}`;
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

// Cron job helper — llamar periódicamente para expirar banners vencidos
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
  adminListBanners,
  adminUpdateBanner,
  adminUploadBannerImage,
  adminDeleteBanner,
  expireBanners,
};