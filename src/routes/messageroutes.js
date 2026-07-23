const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middlewares/authmiddleware');
const { authorizeSection } = require('../middlewares/rolemiddleware');

// Límite solo para el envío de mensajes — no afecta el polling de lectura
// (getConversations/getMessages se llaman cada pocos segundos desde el frontend)
const sendMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Estás enviando mensajes muy rápido, esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
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
// Nota: authorizeSection('messages') solo restringe si req.user.role === 'admin'.
// Buscadores y prestadores usando estas rutas para sus propios chats no se ven afectados.
router.use(authorizeSection('messages'));

// Rutas fijas ANTES de :conversationId
router.get('/conversations', getConversations);
router.get('/unread-count', getUnreadCount);
router.post('/', sendMessageLimiter, sendMessage);

// Rutas con :conversationId
router.get('/:conversationId', getMessages);
router.patch('/:conversationId/read', markAsRead);
router.patch('/:conversationId/archive', archiveConversation);
router.patch('/:conversationId/unarchive', unarchiveConversation);
router.patch('/:conversationId/pin', pinConversation);
router.patch('/:conversationId/mark-unread', markUnread);
router.delete('/:conversationId', deleteConversation);

module.exports = router;