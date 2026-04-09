const express = require('express');
const router = express.Router();
const ServiceCategory = require('../models/servicecategory');

// GET /api/categories — lista todas las categorías activas
router.get('/', async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ active: true }).sort({ name: 1 });
    res.json({ categories });
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST /api/categories — solo admin puede crear (fase 3)
// PATCH /api/categories/:id — solo admin puede editar (fase 3)

module.exports = router;