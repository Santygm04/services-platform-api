const express = require('express');
const router  = express.Router();
const {
  createPreference,
  createRecurring,
  webhook,
  cancelSubscription,
  getMySubscription,
  getPaymentHistory,
} = require('../controllers/subscriptioncontroller');
const { protect } = require('../middlewares/authmiddleware');

// Webhook de MercadoPago — SIN protect (MP no manda JWT)
// IMPORTANTE: registrar esta ruta en el panel de MP como notification_url
router.post('/webhook', webhook);

// Rutas protegidas
router.post('/create-preference', protect, createPreference); // pago manual
router.post('/create-recurring',  protect, createRecurring);  // suscripción recurrente
router.post('/cancel',            protect, cancelSubscription);
router.get('/me',                 protect, getMySubscription);
router.get('/history',            protect, getPaymentHistory);

module.exports = router;