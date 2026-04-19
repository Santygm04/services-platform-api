const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const ProviderProfile = require('../models/ProviderProfile');
const SeekerProfile = require('../models/SeekerProfile');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// ── Multer: almacenamiento en memoria (no en disco) ───────
// Las fotos se suben a Cloudinary, no se guardan localmente
const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) cb(null, true);
  else cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
};

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

const protect_provider = [protect, authorizeRoles('provider')];
const protect_seeker = [protect, authorizeRoles('seeker')];

// ── Helper: subir buffer a Cloudinary ─────────────────────
const uploadToCloudinary = (fileBuffer, folder, publicId) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

// ═══════════════════════════════════════════════════════════════
// PROVIDER UPLOADS
// ═══════════════════════════════════════════════════════════════

// POST /api/upload/photo — subir foto de perfil (archivo)
router.post('/photo', protect_provider, uploadMemory.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

    const publicId = `profile_${req.user._id}_${Date.now()}`;
    const result = await uploadToCloudinary(req.file.buffer, 'zonaservicios/profiles', publicId);

    const profile = await ProviderProfile.findOneAndUpdate(
      { userId: req.user._id },
      { profilePhoto: result.secure_url },
      { new: true }
    );

    res.json({
      message: 'Foto actualizada',
      profilePhoto: result.secure_url,
      profile,
    });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    res.status(500).json({ message: err.message || 'Error al subir imagen' });
  }
});

// PATCH /api/upload/photo-url — foto de perfil por URL
router.patch('/photo-url', protect_provider, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'URL requerida' });

    const profile = await ProviderProfile.findOneAndUpdate(
      { userId: req.user._id },
      { profilePhoto: url },
      { new: true }
    );

    res.json({ message: 'Foto actualizada', profilePhoto: url, profile });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// POST /api/upload/portfolio — agregar imagen al portfolio (archivo)
router.post('/portfolio', protect_provider, uploadMemory.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    if (profile.plan !== 'plus') return res.status(403).json({ message: 'Solo disponible en Plan Plus' });

    const publicId = `portfolio_${req.user._id}_${Date.now()}`;
    const result = await uploadToCloudinary(req.file.buffer, 'zonaservicios/portfolio', publicId);

    const caption = req.body.caption || '';
    profile.portfolio.push({
      imageUrl: result.secure_url,
      caption,
      uploadedAt: new Date(),
    });

    await profile.save();

    res.json({
      message: 'Imagen agregada al portfolio',
      portfolio: profile.portfolio,
    });
  } catch (err) {
    console.error('uploadPortfolio error:', err);
    res.status(500).json({ message: err.message || 'Error al subir imagen' });
  }
});

// POST /api/upload/portfolio-url — agregar imagen al portfolio por URL
router.post('/portfolio-url', protect_provider, async (req, res) => {
  try {
    const { imageUrl, caption } = req.body;
    if (!imageUrl) return res.status(400).json({ message: 'URL requerida' });

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    if (profile.plan !== 'plus') return res.status(403).json({ message: 'Solo disponible en Plan Plus' });

    profile.portfolio.push({
      imageUrl,
      caption: caption || '',
      uploadedAt: new Date(),
    });

    await profile.save();
    res.json({ message: 'Imagen agregada', portfolio: profile.portfolio });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// DELETE /api/upload/portfolio/:index — eliminar imagen del portfolio
router.delete('/portfolio/:index', protect_provider, async (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    if (idx < 0 || idx >= profile.portfolio.length) return res.status(400).json({ message: 'Índice inválido' });

    profile.portfolio.splice(idx, 1);
    await profile.save();

    res.json({ message: 'Imagen eliminada', portfolio: profile.portfolio });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// POST /api/upload/links — agregar link externo
router.post('/links', protect_provider, async (req, res) => {
  try {
    const { url, label } = req.body;
    if (!url) return res.status(400).json({ message: 'URL requerida' });

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });
    if (profile.plan !== 'plus') return res.status(403).json({ message: 'Solo disponible en Plan Plus' });

    profile.links.push({ url, label: label || url });
    await profile.save();

    res.json({ message: 'Link agregado', links: profile.links });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// DELETE /api/upload/links/:index
router.delete('/links/:index', protect_provider, async (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Perfil no encontrado' });

    profile.links.splice(idx, 1);
    await profile.save();

    res.json({ message: 'Link eliminado', links: profile.links });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEEKER UPLOADS
// ═══════════════════════════════════════════════════════════════

// POST /api/upload/seeker-photo — subir foto de perfil seeker (archivo)
router.post('/seeker-photo', protect_seeker, uploadMemory.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

    const publicId = `seeker_${req.user._id}_${Date.now()}`;
    const result = await uploadToCloudinary(req.file.buffer, 'zonaservicios/seeker-profiles', publicId);

    const profile = await SeekerProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { profilePhoto: result.secure_url } },
      { new: true, upsert: true }
    );

    res.json({
      message: 'Foto actualizada',
      profilePhoto: result.secure_url,
      profile,
    });
  } catch (err) {
    console.error('uploadSeekerPhoto error:', err);
    res.status(500).json({ message: err.message || 'Error al subir imagen' });
  }
});

// PATCH /api/upload/seeker-photo-url — foto de perfil seeker por URL
router.patch('/seeker-photo-url', protect_seeker, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'URL requerida' });

    const profile = await SeekerProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { profilePhoto: url } },
      { new: true, upsert: true }
    );

    res.json({ message: 'Foto actualizada', profilePhoto: url, profile });
  } catch (err) {
    res.status(500).json({ message: 'Error interno' });
  }
});

module.exports = router;