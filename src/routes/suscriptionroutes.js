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

// ── Webhook — SIN protect (MP no manda JWT) ───────────────
router.post('/webhook', webhook);

// ── Redirects de MP → reenvían al frontend ────────────────
// MP no redirige a localhost en producción.
// El backend recibe el redirect de MP y hace un 302 al frontend local.
router.get('/redirect/success', (req, res) => {
  const { plan = '', payment_id = '', status = '' } = req.query;
  const url = `${process.env.FRONTEND_URL}/pago/success?plan=${plan}&payment_id=${payment_id}&status=${status}`;
  console.log(`[MP Redirect] SUCCESS → ${url}`);
  res.redirect(url);
});

router.get('/redirect/failure', (req, res) => {
  const url = `${process.env.FRONTEND_URL}/pago/failure`;
  console.log(`[MP Redirect] FAILURE → ${url}`);
  res.redirect(url);
});

router.get('/redirect/pending', (req, res) => {
  const { plan = '' } = req.query;
  const url = `${process.env.FRONTEND_URL}/pago/pending?plan=${plan}`;
  console.log(`[MP Redirect] PENDING → ${url}`);
  res.redirect(url);
});

// ── Rutas protegidas ──────────────────────────────────────
router.post('/create-preference', protect, createPreference);
router.post('/create-recurring',  protect, createRecurring);
router.post('/cancel',            protect, cancelSubscription);
router.get('/me',                 protect, getMySubscription);
router.get('/history',            protect, getPaymentHistory);

module.exports = router;