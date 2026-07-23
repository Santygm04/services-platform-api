const mongoose        = require('mongoose');
const ProfileEvent    = require('../models/profileevent');
const ProviderProfile = require('../models/ProviderProfile');

const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return undefined;
  return value.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
};

// Solo dejamos pasar las claves de meta que realmente usa el frontend,
// cada una sanitizada y acotada — meta llega sin auth, así que no confiamos en su forma.
const sanitizeMeta = (meta) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const clean = {};
  if (typeof meta.linkUrl === 'string') {
    try {
      const parsed = new URL(meta.linkUrl.trim());
      if (['http:', 'https:'].includes(parsed.protocol)) clean.linkUrl = meta.linkUrl.trim().slice(0, 500);
    } catch { /* URL inválida, se descarta */ }
  }
  if (typeof meta.linkLabel === 'string') {
    const label = sanitizeText(meta.linkLabel, 100);
    if (label) clean.linkLabel = label;
  }
  return clean;
};

// ── POST /api/events/track ─────────────────────────────────
// Body: { providerId, eventType, meta? }
// No requiere auth — cualquiera puede generar un click
const trackEvent = async (req, res) => {
  try {
    const { providerId, eventType } = req.body;

    if (!providerId || !eventType) {
      return res.status(400).json({ message: 'providerId y eventType son requeridos' });
    }
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({ message: 'providerId inválido' });
    }

    const validTypes = ['profile_view', 'whatsapp_click', 'phone_click', 'share_click', 'link_click'];
    if (!validTypes.includes(eventType)) {
      return res.status(400).json({ message: 'eventType inválido' });
    }

    const providerExists = await ProviderProfile.exists({ _id: providerId });
    if (!providerExists) {
      return res.status(404).json({ message: 'Prestador no encontrado' });
    }

    await ProfileEvent.create({ providerId, eventType, meta: sanitizeMeta(req.body.meta) });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('trackEvent error:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

// ── GET /api/events/me ─────────────────────────────────────
// Devuelve resumen + detalle de los últimos 30 días para el provider logueado
const getMyEvents = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id }).select('_id');
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const events = await ProfileEvent.find({
      providerId: profile._id,
      createdAt:  { $gte: since },
    }).sort({ createdAt: -1 });

    // Resumen por tipo
    const summary = {
      profile_view:   0,
      whatsapp_click: 0,
      phone_click:    0,
      share_click:    0,
      link_click:     0,
    };
    events.forEach(e => {
      if (summary[e.eventType] !== undefined) summary[e.eventType]++;
    });

    // Top links clicados (solo link_click con linkUrl en meta)
    const linkMap = {};
    events
      .filter(e => e.eventType === 'link_click' && e.meta?.linkUrl)
      .forEach(e => {
        const key = e.meta.linkLabel || e.meta.linkUrl;
        linkMap[key] = (linkMap[key] || 0) + 1;
      });
    const topLinks = Object.entries(linkMap)
      .map(([_id, count]) => ({ _id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Clicks por día (últimos 14 días)
    const dailyMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
      dailyMap[key] = 0;
    }
    events.forEach(e => {
      const key = new Date(e.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
      if (dailyMap[key] !== undefined) dailyMap[key]++;
    });
    const dailyClicks = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    res.json({ summary, topLinks, dailyClicks, total: events.length });
  } catch (err) {
    console.error('getMyEvents error:', err);
    res.status(500).json({ message: 'Error interno' });
  }
};

module.exports = { trackEvent, getMyEvents };