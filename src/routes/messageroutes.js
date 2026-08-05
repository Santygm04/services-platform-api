const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeSection } = require('../middlewares/rolemiddleware');
const { sendMessageValidator } = require('../middlewares/validators');

const sendMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Estás enviando mensajes muy rápido, esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const {
  sendMessage, getConversations, getMessages, getUnreadCount,
  markAsRead, archiveConversation, unarchiveConversation,
  deleteConversation, pinConversation, markUnread, getUserPhoto,
} = require('../controllers/messagecontroller');

router.use(protect);
router.use(authorizeSection('messages'));

// Rutas fijas ANTES de :conversationId
router.get('/conversations',  getConversations);
router.get('/unread-count',   getUnreadCount);
router.get('/user-photo/:userId', getUserPhoto);
router.post('/',              sendMessageLimiter, sendMessageValidator, sendMessage);

// Rutas con :conversationId
router.get('/:conversationId',              getMessages);
router.patch('/:conversationId/read',       markAsRead);
router.patch('/:conversationId/archive',    archiveConversation);
router.patch('/:conversationId/unarchive',  unarchiveConversation);
router.patch('/:conversationId/pin',        pinConversation);
router.patch('/:conversationId/mark-unread',markUnread);
router.delete('/:conversationId',           deleteConversation);

module.exports = router;