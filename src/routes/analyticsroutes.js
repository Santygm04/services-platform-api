const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');

const admin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso solo para administradores' });
  }
  next();
};
const {
  getSummary,
  getTraffic,
  getTopPages,
  getDevices,
  getTrafficSources,
  getCountries,
  getRealtime,
} = require('../controllers/analyticscontroller');

// Todas las rutas requieren admin
router.use(protect, admin);

router.get('/summary',   getSummary);      // ?startDate=30daysAgo&endDate=today
router.get('/traffic',   getTraffic);      // ?startDate=14daysAgo&endDate=today
router.get('/pages',     getTopPages);     // ?startDate=30daysAgo&endDate=today&limit=15
router.get('/devices',   getDevices);      // ?startDate=30daysAgo&endDate=today
router.get('/sources',   getTrafficSources); // ?startDate=30daysAgo&endDate=today
router.get('/countries', getCountries);    // ?startDate=30daysAgo&endDate=today
router.get('/realtime',  getRealtime);     // sin parámetros

module.exports = router;