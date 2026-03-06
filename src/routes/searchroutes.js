const express = require('express');
const router = express.Router();
const {
  searchProviders,
  getFeatured,
  getUrgent,
} = require('../controllers/searchcontroller');

// Todas públicas — no requieren autenticación
router.get('/providers', searchProviders);
router.get('/featured', getFeatured);
router.get('/urgent', getUrgent);

module.exports = router;