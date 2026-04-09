const express = require('express');
const router = express.Router();
const {
  searchProviders,
  getFeatured,
  getUrgent,
  getBySlug,
  getCategories,
} = require('../controllers/searchcontroller');
const { optionalAuth } = require('../middlewares/authmiddleware');

// Rutas fijas ANTES de las parametrizadas
router.get('/featured', getFeatured);
router.get('/urgent', getUrgent);
router.get('/categories', getCategories);
router.get('/by-slug/:slug', getBySlug);

// Búsqueda general — optionalAuth para detectar si es visitante o logueado
router.get('/providers', optionalAuth, searchProviders);

module.exports = router;