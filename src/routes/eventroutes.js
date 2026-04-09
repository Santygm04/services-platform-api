const express = require('express');
const router  = express.Router();
const { trackEvent, getMyEvents } = require('../controllers/eventcontroller');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// POST /api/events/track — público (sin auth), fire-and-forget desde el frontend
router.post('/track', trackEvent);

// GET /api/events/me — solo el provider logueado ve sus propios eventos
router.get('/me', protect, authorizeRoles('provider'), getMyEvents);

module.exports = router;