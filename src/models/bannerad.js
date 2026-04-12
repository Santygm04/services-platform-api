const mongoose = require('mongoose');

// ── Precios por posición (ARS/semana) ─────────────────────
// Definidos en el schema para referencia y en bannercontroller.js para lógica
// sidebar_left  → barra lateral izquierda en búsqueda (desktop)
// sidebar_right → barra lateral derecha en búsqueda (desktop)  
// home_sidebar  → sidebar derecho en Home
// mobile        → entre filtros y resultados en mobile
// featured      → banner destacado en Home (hero/top)
const BANNER_POSITIONS = {
  sidebar_left:  { label: 'Sidebar Izquierdo (Búsqueda)',  pricePerWeek: 2999 },
  sidebar_right: { label: 'Sidebar Derecho (Búsqueda)',    pricePerWeek: 2999 },
  home_sidebar:  { label: 'Sidebar Home',                  pricePerWeek: 3999 },
  mobile:        { label: 'Banner Mobile (Búsqueda)',      pricePerWeek: 1999 },
  featured:      { label: 'Banner Destacado Home (Top)',   pricePerWeek: 5999 },
};

const bannerAdSchema = new mongoose.Schema(
  {
    // Quién compró el banner (prestador o admin con userId del sistema)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Imagen del banner (URL de Cloudinary)
    imageUrl: {
      type: String,
      default: null,
    },

    // URL de destino al hacer clic
    linkUrl: {
      type: String,
      trim: true,
      default: '',
    },

    // Texto alternativo / título del anuncio
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },

    // ── Posición ──────────────────────────────────────────
    // sidebar_left / sidebar_right → reemplaza el antiguo 'sidebar'
    // home_sidebar                 → reemplaza 'home_top'
    // mobile                       → mobile entre filtros y resultados
    // featured                     → banner hero/top en Home
    position: {
      type: String,
      enum: ['sidebar_left', 'sidebar_right', 'home_sidebar', 'mobile', 'featured',
             'sidebar'],  // 'sidebar' mantenido por retrocompatibilidad
      default: 'sidebar_left',
    },

    // Precio por semana en el momento de la compra (para historial)
    pricePerWeek: {
      type: Number,
      default: 0,
    },

    // Fechas de vigencia
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },

    // Semanas contratadas
    weeks: {
      type: Number,
      min: 1,
      max: 52,
      required: true,
    },

    // Precio total pagado (0 = creado por admin sin pago)
    amountPaid: {
      type: Number,
      default: 0,
    },

    // Estado
    status: {
      type: String,
      enum: ['pending_payment', 'active', 'expired', 'cancelled'],
      default: 'pending_payment',
    },

    // MercadoPago
    mpPaymentId: {
      type: String,
      default: null,
    },
    mpPreferenceId: {
      type: String,
      default: null,
    },

    // Notas internas (admin)
    adminNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// ── Índices ───────────────────────────────────────────────
bannerAdSchema.index({ position: 1, status: 1, startsAt: 1, endsAt: 1 });
bannerAdSchema.index({ userId: 1 });
bannerAdSchema.index({ status: 1, endsAt: 1 }); // para cron de expiración

// Exportar el mapa de posiciones para usar en controller
bannerAdSchema.statics.BANNER_POSITIONS = BANNER_POSITIONS;

module.exports =
  mongoose.models.BannerAd || mongoose.model('BannerAd', bannerAdSchema);