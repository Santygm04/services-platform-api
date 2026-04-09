const Report = require('../models/report');

// POST /api/reports — crear reporte (usuarios autenticados)
const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    if (!['provider', 'review'].includes(targetType)) {
      return res.status(400).json({ message: 'targetType inválido' });
    }
    if (!reason) {
      return res.status(400).json({ message: 'Razón requerida' });
    }

    const report = await Report.create({
      reportedBy: req.user._id,
      targetType,
      targetId,
      reason,
      description: description?.trim().slice(0, 500),
    });

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
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const filter = status === 'all' ? {} : { status };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reportedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Report.countDocuments(filter),
    ]);

    res.json({ reports, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ message: 'Error al obtener reportes' });
  }
};

// PATCH /api/admin/reports/:id — actualizar estado (admin)
const updateReport = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    if (!['reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status,
        adminNotes,
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
    await Report.findByIdAndDelete(req.params.id);
    res.json({ message: 'Reporte eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar reporte' });
  }
};

module.exports = { createReport, getReports, updateReport, deleteReport };