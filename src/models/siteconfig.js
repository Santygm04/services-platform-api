const mongoose = require('mongoose');

// ── Configuración global del sitio — documento único (singleton) ──
// Acá vive todo lo que el admin puede editar sin tocar código:
// precios de planes (con precio tachado / promo) y precios de banners.
const siteConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },

    plans: {
      plus: {
        price:         { type: Number, default: 4999 },
        originalPrice: { type: Number, default: null },
        promoLabel:    { type: String, default: '' },
        promoActive:   { type: Boolean, default: false },
        promoEndDate:  { type: Date,   default: null },
      },
      premium: {
        price:         { type: Number, default: 9999 },
        originalPrice: { type: Number, default: null },
        promoLabel:    { type: String, default: '' },
        promoActive:   { type: Boolean, default: false },
        promoEndDate:  { type: Date,   default: null },
      },
    },

    bannerPrices: {
      sidebar:         { type: Number, default: 18000 },
      home_top:        { type: Number, default: 35000 },
      home_featured:   { type: Number, default: 28000 },
      home_bottom:     { type: Number, default: 20000 },
      profile_sidebar: { type: Number, default: 18000 },
    },

    offers: {
      type: [
        {
          title:         { type: String, default: '' },
          description:   { type: String, default: '' },
          badge:         { type: String, default: '' },
          active:        { type: Boolean, default: true },
          position:      { type: String, default: '' }, // '' = todas las posiciones
          discountType:  { type: String, enum: ['none', 'percent', 'weeks2x1', 'free'], default: 'none' },
          discountValue: { type: Number, default: 0 }, // % si discountType === 'percent'
          maxWeeks:      { type: Number, default: 0 }, // 0 = sin límite. Semanas con descuento antes de cobrar precio normal.
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Devuelve el único documento de config, creándolo con defaults si no existe
siteConfigSchema.statics.getSingleton = async function () {
  let cfg = await this.findOne({ key: 'main' });
  if (!cfg) cfg = await this.create({ key: 'main' });
  return cfg;
};

module.exports =
  mongoose.models.SiteConfig || mongoose.model('SiteConfig', siteConfigSchema);