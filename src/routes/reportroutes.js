const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const { createReport, getReports, updateReport, deleteReport } = require('../controllers/reportcontroller');

// Usuario autenticado puede crear un reporte
router.post('/', protect, requireEmailVerified, createReport);

// Admin
router.get('/admin', protect, authorizeRoles('admin'), getReports);
router.patch('/admin/:id', protect, authorizeRoles('admin'), updateReport);
router.delete('/admin/:id', protect, authorizeRoles('admin'), deleteReport);

module.exports = router;