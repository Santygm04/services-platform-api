const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const SeekerProfile = require('../models/SeekerProfile');
const ProviderProfile = require('../models/ProviderProfile');

// Radio de búsqueda. El checklist marca "configuración de radios" como
// funcionalidad de panel admin todavía no implementada — por ahora es constante.
const DEFAULT_RADIUS_KM = 15;

// ── Sanitización de texto libre (mismo patrón que reviewcontroller.js) ──
const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return value;
  let clean = value.replace(/<[^>]*>/g, '').trim();
  if (maxLength) clean = clean.slice(0, maxLength);
  return clean;
};

// Calcula expiresAt según urgencia (ver docs/sos-zona)
// verde: 7 días · amarillo: 24 horas · rojo: 2 horas
function calcularExpiracion(urgency) {
  const now = Date.now();
  const MS_HORA = 60 * 60 * 1000;
  switch (urgency) {
    case 'red':
      return new Date(now + 2 * MS_HORA);
    case 'yellow':
      return new Date(now + 24 * MS_HORA);
    case 'green':
      return new Date(now + 7 * 24 * MS_HORA);
    default:
      return null;
  }
}

/**
 * Busca prestadores compatibles: misma categoría, dentro del radio, con location seteada.
 * - urgencia verde: solo activeStatus=true Y urgencyAvailable=true
 *   (reutilizamos el campo `urgencyAvailable` que ya existía en ProviderProfile
 *   sin estar conectado a nada — es exactamente el flag que necesita SOS Zona)
 * - urgencia amarilla/roja: todos los que tengan location, activos o no
 */
async function buscarPrestadoresCompatibles({ categoryId, coordinates, urgency }) {
  const query = {
    category: categoryId,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates },
        $maxDistance: DEFAULT_RADIUS_KM * 1000, // metros
      },
    },
  };

  if (urgency === 'green') {
    query.activeStatus = true;
    query.urgencyAvailable = true;
  }

  return ProviderProfile.find(query).select('userId').lean();
}

// ── POST /api/tickets ────────────────────────────────────
const createTicket = async (req, res) => {
  try {
    const { category, description, photos, urgency, maxPrice, thirdParty } = req.body;

    // Validación manual (mismo patrón que el resto de los controllers — no hay
    // express-validator instalado en este proyecto)
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'category inválida' });
    }
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ message: 'description es obligatoria' });
    }
    if (!['green', 'yellow', 'red'].includes(urgency)) {
      return res.status(400).json({ message: 'urgency debe ser green, yellow o red' });
    }
    if (maxPrice !== undefined && maxPrice !== null && Number(maxPrice) < 0) {
      return res.status(400).json({ message: 'maxPrice inválido' });
    }
    if (photos !== undefined && !Array.isArray(photos)) {
      return res.status(400).json({ message: 'photos debe ser un array de URLs' });
    }

    // 1. Ubicación confirmada del buscador — igual que req.user._id ya viene
    // resuelto por el middleware protect, no importa si el rol es 'seeker' o 'both'
    const seekerProfile = await SeekerProfile.findOne({ userId: req.user._id });
    if (!seekerProfile?.location?.coordinates?.length) {
      return res.status(409).json({
        message: 'Confirmá tu ubicación antes de crear un ticket SOS Zona.',
        code: 'location_required',
      });
    }

    const coordinates = seekerProfile.location.coordinates;
    const cleanDescription = sanitizeText(description, 1000);
    const expiresAt = calcularExpiracion(urgency);

    // 2. Prestadores compatibles (categoría + radio + disponibilidad según urgencia)
    const compatibleProviders = await buscarPrestadoresCompatibles({
      categoryId: category,
      coordinates,
      urgency,
    });

    // 3. Crear el ticket
    const ticket = await Ticket.create({
      seekerId: req.user._id,
      category,
      description: cleanDescription,
      photos: photos || [],
      urgency,
      maxPrice: maxPrice ?? null,
      status: 'searching',
      expiresAt,
      location: { type: 'Point', coordinates },
      thirdParty: thirdParty?.isThirdParty
        ? {
            isThirdParty: true,
            name: sanitizeText(thirdParty.name, 100),
            phone: sanitizeText(thirdParty.phone, 30),
            address: sanitizeText(thirdParty.address, 200),
            notifiedVia: [], // se completa cuando se implemente F2-24 (WhatsApp/email)
          }
        : { isThirdParty: false },
      notifiedProviders: compatibleProviders.map((p) => ({
        providerId: p.userId,
        notifiedAt: new Date(),
        respondedAt: null,
        response: null,
      })),
    });

    // 4. Broadcast en tiempo real — mismo patrón que messagecontroller.js:
    // un solo `io`, sin namespaces, cada usuario ya está en su room (su propio userId)
    // gracias al evento 'join' que dispara el cliente al conectar (ver server.js).
    const io = req.app.get('io');
    if (io) {
      compatibleProviders.forEach((p) => {
        io.to(p.userId.toString()).emit('ticket:new', ticket);
      });
    }
    // TODO: push (FCM/APNs) a los prestadores sin socket conectado — pendiente
    // de que se implemente el servicio de push (checklist: Notificaciones, 0%).

    return res.status(201).json(ticket);
  } catch (err) {
    console.error('createTicket:', err);
    return res.status(500).json({ message: 'Error interno' });
  }
};

module.exports = { createTicket };