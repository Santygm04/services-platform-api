const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified } = require('../middlewares/authmiddleware');
const { authorizeRoles, authorizeSection } = require('../middlewares/rolemiddleware');
const { createReport, getReports, updateReport, deleteReport } = require('../controllers/reportcontroller');

// Usuario autenticado puede crear un reporte
router.post('/', protect, requireEmailVerified, createReport);

// Admin
router.get('/admin', protect, authorizeRoles('admin'), authorizeSection('reports'), getReports);
router.patch('/admin/:id', protect, authorizeRoles('admin'), authorizeSection('reports'), updateReport);
router.delete('/admin/:id', protect, authorizeRoles('admin'), authorizeSection('reports'), deleteReport);

module.exports = router;