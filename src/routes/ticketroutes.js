const express = require('express');
const router = express.Router();
const { createTicket } = require('../controllers/ticketcontroller');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');

// Solo buscadores (o 'both') pueden crear tickets SOS Zona
router.post('/', protect, authorizeRoles('seeker'), createTicket);

module.exports = router;