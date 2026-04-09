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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      default: null,
    },
    profilePhoto: {
      type: String,
      default: '',
    },
    // ── SEO: slug semántico ──
    // Formato: "electricista-belgrano-juan-garcia-abc123"
    // Se genera automáticamente al guardar si profession+zone+userId existen
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // permite nulls duplicados
      default: undefined,
    },
    plan: {
      type: String,
      enum: ['free', 'plus'],
      default: 'free',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    urgencyAvailable: {
      type: Boolean,
      default: false,
    },
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
    portfolio: [
      {
        imageUrl: { type: String },
        caption: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    links: [
      {
        label: { type: String },
        url: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// ── Helper: generar slug ──────────────────────────────────
const slugify = (text) =>
  text
    .toString()
    .normalize('NFD')                   // descomponer acentos
    .replace(/[\u0300-\u036f]/g, '')    // remover diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // solo alfanuméricos
    .replace(/[\s_]+/g, '-')           // espacios → guiones
    .replace(/-+/g, '-')              // múltiples guiones → uno
    .replace(/^-|-$/g, '');           // trim guiones

// ── Pre-save: auto-generar slug si no tiene ───────────────
providerProfileSchema.pre('save', async function() {
  if (!this.isModified('profession') && !this.isModified('zone') && this.slug) return;
  
  const base = [this.profession, this.zone]
    .filter(Boolean)
    .map(s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .join('-');
  
  if (!base) {
  this.slug = undefined;
  return;
}
  
  const suffix = this._id.toString().slice(-6);
  this.slug = `${base}-${suffix}`;
});

// Índice para búsqueda por slug
providerProfileSchema.index({ slug: 1 });

module.exports = mongoose.models.ProviderProfile || mongoose.model('ProviderProfile', providerProfileSchema);