const Review = require('../models/review');
const ProviderProfile = require('../models/providerprofile');
const User = require('../models/user');

// ── POST /api/reviews ────────────────────────────────────
const createReview = async (req, res) => {
  try {
    const { providerId, rating, comment, alias } = req.body;

    if (!providerId || !rating) {
      return res.status(400).json({ message: 'providerId y rating son obligatorios' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'El rating debe ser entre 1 y 5' });
    }

    const provider = await ProviderProfile.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: 'Prestador no encontrado' });
    }

    // Un usuario no puede reseñar su propio perfil
    if (provider.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'No podés reseñar tu propio perfil' });
    }

    // Un usuario no puede dejar más de una reseña por prestador
    const existing = await Review.findOne({
      reviewerId: req.user._id,
      providerId,
    });
    if (existing) {
      return res.status(400).json({ message: 'Ya dejaste una reseña para este prestador' });
    }

    const review = await Review.create({
      reviewerId: req.user._id,
      providerId,
      rating,
      comment: comment || '',
      alias: alias || '',
    });

    // Recalcular promedio del prestador
    await recalculateRating(providerId);

    res.status(201).json({ message: 'Reseña creada', review });
  } catch (error) {
    console.error('createReview error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── GET /api/providers/:id/reviews ──────────────────────
const getProviderReviews = async (req, res) => {
  try {
    const { id } = req.params;

    const reviews = await Review.find({
      providerId: id,
      hidden: false,
    }).sort({ createdAt: -1 });

    // Ocultar identidad real — mostrar alias o "Usuario anónimo"
    const sanitized = reviews.map((r) => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      alias: r.alias || 'Usuario anónimo',
      reply: r.reply,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
    }));

    res.json({ reviews: sanitized });
  } catch (error) {
    console.error('getProviderReviews error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── POST /api/reviews/:reviewId/reply ────────────────────
// Solo prestadores Plus pueden responder
const replyToReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({ message: 'La respuesta no puede estar vacía' });
    }

    const provider = await ProviderProfile.findOne({ userId: req.user._id });
    if (!provider) {
      return res.status(404).json({ message: 'Perfil de prestador no encontrado' });
    }

    if (provider.plan !== 'plus') {
      return res.status(403).json({ message: 'Solo prestadores Plus pueden responder reseñas' });
    }

    const review = await Review.findOne({
      _id: reviewId,
      providerId: provider._id,
    });

    if (!review) {
      return res.status(404).json({ message: 'Reseña no encontrada' });
    }

    review.reply = reply;
    review.repliedAt = new Date();
    await review.save();

    res.json({ message: 'Respuesta guardada', review });
  } catch (error) {
    console.error('replyToReview error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── PATCH /api/reviews/:reviewId/report ─────────────────
const reportReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Reseña no encontrada' });
    }

    // Por ahora solo marca como reportada — admin la modera
    res.json({ message: 'Reseña reportada. Será revisada por el equipo.' });
  } catch (error) {
    console.error('reportReview error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── DELETE /api/reviews/:reviewId ────────────────────────
// Solo admin puede eliminar
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByIdAndDelete(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Reseña no encontrada' });
    }

    await recalculateRating(review.providerId);

    res.json({ message: 'Reseña eliminada' });
  } catch (error) {
    console.error('deleteReview error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ── HELPER: recalcular promedio ──────────────────────────
const recalculateRating = async (providerId) => {
  const reviews = await Review.find({ providerId, hidden: false });

  const count = reviews.length;
  const average =
    count > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / count
      : 0;

  await ProviderProfile.findByIdAndUpdate(providerId, {
    ratingAverage: Math.round(average * 10) / 10,
    reviewsCount: count,
  });
};

module.exports = {
  createReview,
  getProviderReviews,
  replyToReview,
  reportReview,
  deleteReview,
};