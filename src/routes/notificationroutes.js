const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const {
  getMyNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  deleteOne,  // ← nuevo
  deleteAll,  // ← nuevo
} = require('../controllers/notificationcontroller');

router.use(protect);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/mark-all-read', markAllRead);
router.patch('/:id/read', markOneRead);
router.delete('/:id', deleteOne);  // ← nuevo
router.delete('/', deleteAll);     // ← nuevo

module.exports = router;