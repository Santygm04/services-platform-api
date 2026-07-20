const mongoose = require('mongoose');

const providerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    profession: {
      type: String,
      trim: true,
      default: '',
    },
    zone: {
      type: String,
      trim: true,
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'La bio no puede superar los 500 caracteres'],
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    specialty: {
      type: String,
      trim: true,
      maxlength: [100, 'La especialidad no puede superar los 100 caracteres'],
      default: '',
    },
    licenseNumber: {
      type: String,
      trim: true,
      maxlength: [50, 'La matrícula no puede superar los 50 caracteres'],
      default: '',
    },
    businessHours: {
      type: String,
      trim: true,
      maxlength: [200, 'El horario no puede superar los 200 caracteres'],
      default: '',
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      default: null,
    },
    // Slug de la subcategoría/especialidad dentro del rubro (ej: "instalaciones-electricas")
    subcategory: {
      type: String,
      trim: true,
      default: '',
    },
    profilePhoto: {
      type: String,
      default: '',
    },

    // ── SEO: slug semántico ──────────────────────────────
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      default: undefined,
    },

    // ── Plan ─────────────────────────────────────────────
    // free    → sin beneficios
    // plus    → $5.000/mes — portfolio hasta 20 fotos, links externos, destacado
    // premium → $10.000/mes → todo lo de Plus + badge dorado + posición top + banner gratis mensual
    plan: {
      type: String,
      enum: ['free', 'plus', 'premium'],
      default: 'free',
    },

    // Fecha hasta la que el plan está activo (para saber si expiró)
    planExpiresAt: {
      type: Date,
      default: null,
    },

    // ── Badge / Sellos ────────────────────────────────────
    // verified → DNI aprobado (verde)
    // plus     → plan Plus activo (azul)
    // premium  → plan Premium activo (dorado)
    // top      → asignado manualmente por admin (especial)
    badges: {
      type: [String],
      enum: ['verified', 'plus', 'premium', 'top'],
      default: [],
    },

    // ── Estado activo/inactivo ────────────────────────────
    // true  → aparece en búsquedas
    // false → oculto temporalmente (vacaciones, etc.)
    activeStatus: {
      type: Boolean,
      default: true,
    },

    lastActiveAt: {
    type: Date,
    default: null,
    },

    // ── Verificación ──────────────────────────────────────
    verified: {
      type: Boolean,
      default: false,
    },
    urgencyAvailable: {
      type: Boolean,
      default: false,
    },

    // ── Sistema de referidos ──────────────────────────────
    // Código único que el prestador puede compartir
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    // userId del prestador que lo refirió (si aplica)
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Créditos acumulados por referidos (en ARS, para descuentos en plan)
    referralCredits: {
      type: Number,
      default: 0,
    },

    // ── Métricas ──────────────────────────────────────────
    viewsTracking: {
      date: {
        type: Date,
        default: null,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },

    // ── Portfolio y links ─────────────────────────────────
    portfolio: [
      {
        imageUrl: { type: String },
        caption:  { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    links: [
      {
        label: { type: String },
        url:   { type: String },
      },
    ],
  },
  { timestamps: true }
);

// ── Pre-save: auto-generar slug ───────────────────────────
providerProfileSchema.pre('save', async function () {
  if (!this.isModified('profession') && !this.isModified('zone') && this.slug) return;

  const base = [this.profession, this.zone]
    .filter(Boolean)
    .map((s) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    )
    .join('-');

  if (!base) {
    this.slug = undefined;
    return;
  }

  const suffix = this._id.toString().slice(-6);
  this.slug = `${base}-${suffix}`;
});

// ── Pre-save: sincronizar badges con plan y verified ──────
// Mantiene el array badges consistente con el estado real
providerProfileSchema.pre('save', function () {
  const badgeSet = new Set(this.badges);

  // Badge verified
  if (this.verified) badgeSet.add('verified');
  else badgeSet.delete('verified');

  // Badge plus / premium según plan activo
  badgeSet.delete('plus');
  badgeSet.delete('premium');

  const planActive = !this.planExpiresAt || this.planExpiresAt > new Date();

  if (this.plan === 'plus' && planActive)    badgeSet.add('plus');
  if (this.plan === 'premium' && planActive) badgeSet.add('premium');

  this.badges = Array.from(badgeSet);
});

// ── Pre-save: generar referralCode si no tiene ────────────
providerProfileSchema.pre('save', function () {
  if (!this.referralCode && this._id) {
    // Formato: ZS- + 6 chars del ObjectId + 4 aleatorios
    const base    = this._id.toString().slice(-6).toUpperCase();
    const random  = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.referralCode = `ZS-${base}${random}`;
  }
});

// ── Índices ───────────────────────────────────────────────
providerProfileSchema.index({ slug: 1 });
providerProfileSchema.index({ plan: 1, activeStatus: 1 });
providerProfileSchema.index({ referralCode: 1 });
providerProfileSchema.index({ zone: 'text', profession: 'text' });

module.exports =
  mongoose.models.ProviderProfile ||
  mongoose.model('ProviderProfile', providerProfileSchema);
