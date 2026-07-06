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
        originalPrice: { type: Number, default: null },  // si existe, se muestra tachado
        promoLabel:    { type: String, default: '' },    // ej "Oferta de lanzamiento"
        promoActive:   { type: Boolean, default: false },
      },
      premium: {
        price:         { type: Number, default: 9999 },
        originalPrice: { type: Number, default: null },
        promoLabel:    { type: String, default: '' },
        promoActive:   { type: Boolean, default: false },
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
          title:       { type: String, default: '' },
          description: { type: String, default: '' },
          badge:       { type: String, default: '' },
          active:      { type: Boolean, default: true },
          position:    { type: String, default: '' }, // '' = todas las posiciones
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