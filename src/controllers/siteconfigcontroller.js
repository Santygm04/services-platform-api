const SiteConfig = require('../models/siteconfig');

// ── GET /api/config — pública, la consumen Planes.jsx / Checkout.jsx / Home.jsx ──
const getPublicConfig = async (req, res) => {
  try {
    const cfg = await SiteConfig.getSingleton();
    res.json({ plans: cfg.plans, bannerPrices: cfg.bannerPrices, referrals: cfg.referrals, offers: cfg.offers });
  } catch (error) {
    console.error('getPublicConfig error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/config/admin — para precargar el form del panel ──
const adminGetConfig = async (req, res) => {
  try {
    const cfg = await SiteConfig.getSingleton();
    res.json({ config: cfg });
  } catch (error) {
    console.error('adminGetConfig error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── PATCH /api/config/admin — el admin edita precios/promos ──
const adminUpdateConfig = async (req, res) => {
  try {
    const { plans, bannerPrices, offers, referrals } = req.body;
    const cfg = await SiteConfig.getSingleton();

    if (plans?.plus)    Object.assign(cfg.plans.plus, plans.plus);
    if (plans?.premium) Object.assign(cfg.plans.premium, plans.premium);
    if (bannerPrices)   Object.assign(cfg.bannerPrices, bannerPrices);
    if (referrals)      Object.assign(cfg.referrals, referrals);
    if (offers !== undefined) {
      cfg.offers = offers;
      cfg.markModified('offers');
    }

    await cfg.save();
    res.json({ message: 'Configuración actualizada', config: cfg });
  } catch (error) {
    console.error('adminUpdateConfig error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = { getPublicConfig, adminGetConfig, adminUpdateConfig };