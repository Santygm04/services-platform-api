const express = require('express');
const router = express.Router();
const {
  searchProviders,
  getFeatured,
  getUrgent,
} = require('../controllers/searchcontroller');
const { optionalAuth } = require('../middlewares/authmiddleware');

// providers usa optionalAuth para detectar si hay usuario y aplicar límite Free
router.get('/providers', optionalAuth, searchProviders);
router.get('/featured', getFeatured);
router.get('/urgent', getUrgent);

module.exports = router;