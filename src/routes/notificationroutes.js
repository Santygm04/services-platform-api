const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const {
  getMyNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
} = require('../controllers/notificationcontroller');

router.use(protect);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/mark-all-read', markAllRead);
router.patch('/:id/read', markOneRead);

module.exports = router;