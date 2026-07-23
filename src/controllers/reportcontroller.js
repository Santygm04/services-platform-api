const mongoose = require('mongoose');
const Report = require('../models/report');
const { notifyAdmins } = require('../utils/adminNotify');

const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  let clean = value.replace(/<[^>]*>/g, '').trim();
  if (maxLength) clean = clean.slice(0, maxLength);
  return clean;
};

const VALID_REPORT_REASONS = ['spam', 'fake', 'offensive', 'harassment', 'wrong_category', 'other'];


const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body;

    if (!['provider', 'review'].includes(targetType)) {
      return res.status(400).json({ message: 'targetType inválido' });
    }
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: 'targetId inválido' });
    }
    if (!VALID_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ message: 'Razón inválida' });
    }

    const cleanDescription = sanitizeText(req.body.description, 500);

    const report = await Report.create({
      reportedBy: req.user._id,
      targetType,
      targetId,
      reason,
      description: cleanDescription,
    });

    notifyAdmins(
      'new_report',
      `Nuevo reporte: ${req.user.name}`,
      `${req.user.name} reportó ${targetType === 'provider' ? 'un perfil' : 'una reseña'} por "${reason}"${cleanDescription ? ': ' + cleanDescription.slice(0, 80) : ''}`,
      '/admin?tab=reports',
      { reportId: report._id, targetType, targetId }
    ).catch(err => console.error('notifyAdmins error:', err));

    res.status(201).json({ message: 'Reporte enviado. Gracias por ayudarnos a mejorar.', report });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Ya reportaste este contenido anteriormente.' });
    }
    console.error('createReport error:', err);
    res.status(500).json({ message: 'Error al enviar el reporte' });
  }
};

// GET /api/admin/reports — listar (admin)
const getReports = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const pageNum  = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const filter = status === 'all' ? {} : { status };
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reportedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Report.countDocuments(filter),
    ]);

    res.json({ reports, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ message: 'Error al obtener reportes' });
  }
};

// PATCH /api/admin/reports/:id — actualizar estado (admin)
const updateReport = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de reporte inválido' });
    }
    const { status } = req.body;
    if (!['reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status,
        adminNotes: sanitizeText(req.body.adminNotes, 500),
        resolvedBy: req.user._id,
        resolvedAt: new Date(),
      },
      { new: true }
    );

    if (!report) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.json(report);
  } catch (err) {
    console.error('updateReport error:', err);
    res.status(500).json({ message: 'Error al actualizar reporte' });
  }
};

// DELETE /api/admin/reports/:id — eliminar (admin)
const deleteReport = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de reporte inválido' });
    }
    const report = await Report.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.json({ message: 'Reporte eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar reporte' });
  }
};

module.exports = { createReport, getReports, updateReport, deleteReport };