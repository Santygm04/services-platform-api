const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const {
  sendMessage,
  getConversations,
  getMessages,
  getUnreadCount,
  markAsRead,
  archiveConversation,
  unarchiveConversation,
  deleteConversation,
  pinConversation,
  markUnread,
} = require('../controllers/messagecontroller');

router.use(protect);

// Rutas fijas ANTES de :conversationId
router.get('/conversations', getConversations);
router.get('/unread-count', getUnreadCount);
router.post('/', sendMessage);

// Rutas con :conversationId
router.get('/:conversationId', getMessages);
router.patch('/:conversationId/read', markAsRead);
router.patch('/:conversationId/archive', archiveConversation);
router.patch('/:conversationId/unarchive', unarchiveConversation);
router.patch('/:conversationId/pin', pinConversation);
router.patch('/:conversationId/mark-unread', markUnread);
router.delete('/:conversationId', deleteConversation);

module.exports = router;