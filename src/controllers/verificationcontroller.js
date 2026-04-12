const cloudinary = require('../config/cloudinary');
const Verification = require('../models/verification');
const ProviderProfile = require('../models/providerprofile');
const User = require('../models/user');
const { sendVerifiedProviderEmail } = require('../services/emailservice');

// ── Helpers ──────────────────────────────────────────────
const getOrCreate = async (userId) => {
  let doc = await Verification.findOne({ userId });
  if (!doc) doc = await Verification.create({ userId });
  return doc;
};

// Subir buffer de multer a Cloudinary
const uploadBufferToCloudinary = (fileBuffer, folder, publicId) => {
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

const fileUrlToBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen: ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || 'image/jpeg';

  return {
    base64: buffer.toString('base64'),
    mediaType: contentType,
  };
};

// ── Verificación con IA (Claude API) ─────────────────────
const analyzeWithAI = async (verification) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY no configurada — verificación manual');
    return {
      autoApprove: false,
      reason: 'Verificación automática no disponible. Se requiere revisión manual.',
    };
  }

  try {
    const imageFields = ['dniFront', 'dniBack', 'selfie'];
    const images = [];

    for (const field of imageFields) {
      const fileUrl = verification[field];
      if (!fileUrl) {
        return {
          autoApprove: false,
          reason: `Falta la imagen ${field}.`,
        };
      }

      const imageData = await fileUrlToBase64(fileUrl);
      images.push(imageData);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: images[0].mediaType,
                  data: images[0].base64,
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: images[1].mediaType,
                  data: images[1].base64,
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: images[2].mediaType,
                  data: images[2].base64,
                },
              },
              {
                type: 'text',
                text: `Sos un sistema de verificación de identidad para una plataforma de servicios en Argentina.

Te envío 3 imágenes:
1. DNI frente (documento nacional de identidad argentino — lado con foto y datos)
2. DNI dorso (lado trasero del DNI)
3. Selfie (foto de la persona sosteniendo el DNI)

Analizá las 3 imágenes y respondé SOLO con un JSON válido (sin markdown, sin backticks, sin texto extra) con esta estructura exacta:

{
  "isValidDNI": true/false,
  "isFrontReadable": true/false,
  "isBackReadable": true/false,
  "hasFaceInSelfie": true/false,
  "isDNIVisibleInSelfie": true/false,
  "overallValid": true/false,
  "confidence": "high"/"medium"/"low",
  "issues": ["lista de problemas encontrados si los hay"],
  "summary": "resumen breve de la verificación en español"
}

Criterios:
- isValidDNI: ¿parece un DNI argentino real? (formato correcto, no una foto de pantalla, no editado)
- isFrontReadable: ¿se leen los datos del frente? (nombre, número, foto)
- isBackReadable: ¿se lee el dorso? (código de barras, datos)
- hasFaceInSelfie: ¿hay una persona visible en la selfie?
- isDNIVisibleInSelfie: ¿la persona sostiene un DNI en la selfie?
- overallValid: true SOLO si todo lo anterior es true y la confidence es "high" o "medium"
- Si algo falla, overallValid debe ser false

Respondé SOLO el JSON, nada más.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      return {
        autoApprove: false,
        reason: 'Error al contactar el servicio de verificación. Se requiere revisión manual.',
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const cleanJson = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('AI response parse error:', parseErr, 'Raw:', text);
      return {
        autoApprove: false,
        reason: 'No se pudo procesar la respuesta de verificación. Revisión manual necesaria.',
      };
    }

    return {
      autoApprove:
        result.overallValid === true &&
        (result.confidence === 'high' || result.confidence === 'medium'),
      aiResult: result,
      reason: result.overallValid
        ? 'Verificación automática aprobada por IA.'
        : `Verificación automática: ${result.summary || 'No cumple los requisitos'}. Problemas: ${(result.issues || []).join(', ') || 'ninguno especificado'}.`,
    };
  } catch (err) {
    console.error('AI verification error:', err);
    return {
      autoApprove: false,
      reason: 'Error en verificación automática. Se requiere revisión manual.',
    };
  }
};

// ── POST /api/verification/dni-front ─────────────────────
const uploadDniFront = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    const verification = await getOrCreate(req.user._id);

    const publicId = `dni_front_${req.user._id}_${Date.now()}`;
    const result = await uploadBufferToCloudinary(req.file.buffer, 'zonaservicios/verification/dni-front', publicId);

    verification.dniFront = result.secure_url;

    if (verification.status === 'rejected') {
      verification.status = 'incomplete';
      verification.rejectionReason = '';
    }

    await verification.save();

    res.json({
      message: 'DNI frente subido',
      dniFront: verification.dniFront,
    });
  } catch (error) {
    console.error('uploadDniFront error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/verification/dni-back ──────────────────────
const uploadDniBack = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    const verification = await getOrCreate(req.user._id);

    const publicId = `dni_back_${req.user._id}_${Date.now()}`;
    const result = await uploadBufferToCloudinary(req.file.buffer, 'zonaservicios/verification/dni-back', publicId);

    verification.dniBack = result.secure_url;

    if (verification.status === 'rejected') {
      verification.status = 'incomplete';
      verification.rejectionReason = '';
    }

    await verification.save();

    res.json({
      message: 'DNI dorso subido',
      dniBack: verification.dniBack,
    });
  } catch (error) {
    console.error('uploadDniBack error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/verification/selfie ────────────────────────
const uploadSelfie = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    const verification = await getOrCreate(req.user._id);

    const publicId = `selfie_${req.user._id}_${Date.now()}`;
    const result = await uploadBufferToCloudinary(req.file.buffer, 'zonaservicios/verification/selfie', publicId);

    verification.selfie = result.secure_url;

    if (verification.status === 'rejected') {
      verification.status = 'incomplete';
      verification.rejectionReason = '';
    }

    await verification.save();

    res.json({
      message: 'Selfie subida',
      selfie: verification.selfie,
    });
  } catch (error) {
    console.error('uploadSelfie error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/verification/submit ────────────────────────
const submitVerification = async (req, res) => {
  try {
    const verification = await getOrCreate(req.user._id);

    if (!verification.dniFront || !verification.dniBack || !verification.selfie) {
      return res.status(400).json({
        message: 'Debés subir DNI frente, DNI dorso y selfie antes de enviar',
        missing: {
          dniFront: !verification.dniFront,
          dniBack: !verification.dniBack,
          selfie: !verification.selfie,
        },
      });
    }

    if (verification.status === 'pending') {
      return res.status(400).json({ message: 'Tu solicitud ya está en revisión' });
    }

    if (verification.status === 'approved') {
      return res.status(400).json({ message: 'Tu identidad ya fue verificada' });
    }

    const aiAnalysis = await analyzeWithAI(verification);

    verification.submittedAt = new Date();
    verification.attempts += 1;
    verification.reviewedAt = null;
    verification.reviewedBy = null;
    verification.rejectionReason = '';
    verification.aiAnalysis = aiAnalysis.aiResult || null;

    if (aiAnalysis.autoApprove) {
      verification.status = 'approved';
      verification.reviewedAt = new Date();
      verification.reviewedBy = null;
      verification.aiAutoApproved = true;

      await verification.save();

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { verified: true } },
        { new: true, strict: false }
      );

      await ProviderProfile.findOneAndUpdate(
        { userId: req.user._id },
        { $set: { verified: true } },
        { upsert: false }
      );

      if (updatedUser?.email) {
        sendVerifiedProviderEmail(updatedUser.email, updatedUser.name).catch((err) =>
          console.error('Error enviando email verificado:', err)
        );
      }

      return res.json({
        message: '✅ ¡Tu identidad fue verificada automáticamente! Ya tenés el badge verificado.',
        status: 'approved',
        autoApproved: true,
        aiSummary: aiAnalysis.aiResult?.summary || 'Verificación exitosa',
      });
    }

    verification.status = 'pending';
    verification.aiAutoApproved = false;
    verification.aiReason = aiAnalysis.reason;

    await verification.save();

    return res.json({
      message:
        'Solicitud enviada. La verificación automática no pudo confirmar tu identidad, así que un admin la revisará en 24-48 horas.',
      status: 'pending',
      autoApproved: false,
      aiReason: aiAnalysis.reason,
    });
  } catch (error) {
    console.error('submitVerification error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/verification/me ──────────────────────────────
const getMyVerification = async (req, res) => {
  try {
    const verification = await getOrCreate(req.user._id);
    res.json({ verification });
  } catch (error) {
    console.error('getMyVerification error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: GET /api/verification/admin/list ───────────────
const listVerifications = async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = status === 'all' ? {} : { status };
    filter.userId = { $exists: true, $ne: null };

    const allVerifs = await Verification.find(filter)
      .populate('userId', 'name email createdAt')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const verifications = allVerifs.filter((v) => v.userId && v.userId.name);

    const totalAgg = await Verification.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $match: {
          'user.0': { $exists: true },
          'user.0.name': { $exists: true, $ne: null },
        },
      },
      { $count: 'total' },
    ]);

    const total = totalAgg[0]?.total ?? 0;

    res.json({
      verifications,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('listVerifications error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: PATCH /api/verification/admin/:userId/approve ──
const approveVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const verification = await Verification.findOne({ userId });

    if (!verification) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (verification.status !== 'pending') {
      return res.status(400).json({ message: 'La solicitud no está en estado pendiente' });
    }

    verification.status = 'approved';
    verification.reviewedAt = new Date();
    verification.reviewedBy = req.user._id;
    verification.rejectionReason = '';
    await verification.save();

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { verified: true } },
      { new: true, strict: false }
    );

    await ProviderProfile.findOneAndUpdate(
      { userId },
      { $set: { verified: true } },
      { upsert: false }
    );

    if (updatedUser?.email) {
      sendVerifiedProviderEmail(updatedUser.email, updatedUser.name).catch((err) =>
        console.error('Error enviando email verificado:', err)
      );
    }

    res.json({ message: 'Verificación aprobada', verification });
  } catch (error) {
    console.error('approveVerification error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: PATCH /api/verification/admin/:userId/reject ───
const rejectVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = '' } = req.body;
    const verification = await Verification.findOne({ userId });

    if (!verification) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (verification.status !== 'pending') {
      return res.status(400).json({ message: 'La solicitud no está en estado pendiente' });
    }

    verification.status = 'rejected';
    verification.reviewedAt = new Date();
    verification.reviewedBy = req.user._id;
    verification.rejectionReason = reason;
    await verification.save();

    await User.findByIdAndUpdate(userId, { $set: { verified: false } }, { strict: false });
    await ProviderProfile.findOneAndUpdate({ userId }, { $set: { verified: false } });

    res.json({ message: 'Verificación rechazada', verification });
  } catch (error) {
    console.error('rejectVerification error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: GET /api/verification/admin/:userId ────────────
const getVerificationDetail = async (req, res) => {
  try {
    const { userId } = req.params;
    const verification = await Verification.findOne({ userId })
      .populate('userId', 'name email createdAt')
      .populate('reviewedBy', 'name');

    if (!verification) return res.status(404).json({ message: 'Solicitud no encontrada' });

    res.json({ verification });
  } catch (error) {
    console.error('getVerificationDetail error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── ADMIN: DELETE /api/verification/admin/:id ─────────────
const deleteVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const verif = await Verification.findByIdAndDelete(id);
    if (!verif) return res.status(404).json({ message: 'Verificación no encontrada' });

    res.json({ message: 'Verificación eliminada', id });
  } catch (error) {
    console.error('deleteVerification error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  uploadDniFront,
  uploadDniBack,
  uploadSelfie,
  submitVerification,
  getMyVerification,
  listVerifications,
  approveVerification,
  rejectVerification,
  getVerificationDetail,
  deleteVerification,
};