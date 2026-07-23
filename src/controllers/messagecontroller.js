const mongoose = require('mongoose');
const Message = require('../models/message');
const { ConversationMeta } = require('../models/message');
const User = require('../models/User');
const Notification = require('../models/notification');

// ── Sanitización de texto libre ────────────────────────────
const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return value;
  let clean = value.replace(/<[^>]*>/g, '').trim();
  if (maxLength) clean = clean.slice(0, maxLength);
  return clean;
};

// ── Helper: obtener o crear meta de conversación ──────────────
const getMeta = async (conversationId, userId) => {
  let meta = await ConversationMeta.findOne({ conversationId, userId });
  if (!meta) {
    meta = await ConversationMeta.create({ conversationId, userId });
  }
  return meta;
};

// ── POST /api/messages — Enviar mensaje ───────────────────────
const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { receiverId, content } = req.body;

    if (!receiverId || !content?.trim()) {
      return res.status(400).json({ message: 'receiverId y content son requeridos' });
    }
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: 'receiverId inválido' });
    }

    const cleanContent = sanitizeText(content, 1000);
    if (!cleanContent) {
      return res.status(400).json({ message: 'El mensaje no puede estar vacío' });
    }
    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: 'No podés enviarte un mensaje a vos mismo' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Usuario destinatario no encontrado' });
    }

    const conversationId = Message.getConversationId(senderId, receiverId);

    const message = await Message.create({
      conversationId,
      sender: senderId,
      receiver: receiverId,
      content: cleanContent,
    });

    const populated = await Message.findById(message._id)
      .populate('sender', 'name role')
      .populate('receiver', 'name role');

    // 🚀 RESPUESTA INMEDIATA (esto hace que no tarde)
    res.status(201).json({ message: populated });

    // 🔥 TODO ESTO AHORA ES ASYNC (no bloquea)
    setImmediate(async () => {
      try {
        await ConversationMeta.updateMany(
          { conversationId, $or: [{ archived: true }, { deleted: true }] },
          { $set: { archived: false, deleted: false } }
        );

        await Notification.create({
          userId: receiverId,
          type: 'new_message',
          title: `Nuevo mensaje de ${req.user.name || 'Un usuario'}`,
          body:
            cleanContent.slice(0, 100) +
            (cleanContent.length > 100 ? '...' : ''),
          meta: { senderId, conversationId, messageId: message._id },
        });

        const io = req.app.get('io');
        if (io) {
          io.to(receiverId.toString()).emit('newMessage', populated);
          console.log('📤 BACK: enviando mensaje a:', receiverId.toString());
        }
      } catch (err) {
        console.error('Post-send async error:', err);
      }
    });

  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ message: 'Error al enviar mensaje' });
  }
};

// ── GET /api/messages/conversations ───────────────────────────
// Query params: ?filter=all|archived|pinned (default: all)
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const filter = req.query.filter || 'all'; // 'all' | 'archived' | 'pinned'

    // Obtener metas del usuario (para saber cuáles están archivadas/eliminadas/fijadas)
    const allMetas = await ConversationMeta.find({ userId }).lean();
    const metaMap = {};
    allMetas.forEach(m => { metaMap[m.conversationId] = m; });

    // Obtener conversaciones
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { receiver: userId }],
          deletedFor: { $ne: userId },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiver', userId] }, { $eq: ['$read', false] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
    ]);

    const conversations = await Promise.all(
      messages.map(async (conv) => {
        const meta = metaMap[conv._id] || {};

        // Filtrar eliminadas
        if (meta.deleted) return null;

        // Filtrar según el filtro solicitado
        if (filter === 'archived' && !meta.archived) return null;
        if (filter === 'pinned' && !meta.pinned) return null;
        if (filter === 'all' && meta.archived) return null; // "all" excluye archivadas

        const otherUserId =
          conv.lastMessage.sender.toString() === userId.toString()
            ? conv.lastMessage.receiver
            : conv.lastMessage.sender;

        const otherUser = await User.findById(otherUserId).select('name role').lean();

        return {
          conversationId: conv._id,
          otherUser: otherUser ? { ...otherUser, _id: otherUser._id } : { name: 'Usuario eliminado', role: 'unknown' },
          lastMessage: {
            content: conv.lastMessage.content,
            createdAt: conv.lastMessage.createdAt,
            senderId: conv.lastMessage.sender,
            read: conv.lastMessage.read,
          },
          unreadCount: meta.markedUnread ? Math.max(conv.unreadCount, 1) : conv.unreadCount,
          pinned: !!meta.pinned,
          archived: !!meta.archived,
        };
      })
    );

    // Filtrar nulls y ordenar: pinned primero, después por fecha
    const filtered = conversations.filter(Boolean);
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
    });

    res.json({ conversations: filtered });
  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ message: 'Error al obtener conversaciones' });
  }
};

// ── GET /api/messages/:conversationId ─────────────────────────
const getMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const ids = conversationId.split('_');
    if (!ids.includes(userId.toString())) {
      return res.status(403).json({ message: 'No tenés acceso a esta conversación' });
    }

    const total = await Message.countDocuments({
      conversationId,
      deletedFor: { $ne: userId },
    });

    const messages = await Message.find({
      conversationId,
      deletedFor: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', 'name role')
      .populate('receiver', 'name role')
      .lean();

    // Marcar como leídos
    await Message.updateMany(
      { conversationId, receiver: userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    // Limpiar markedUnread
    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { markedUnread: false } }
    );

    res.json({
      messages: messages.reverse(),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Error al obtener mensajes' });
  }
};

// ── GET /api/messages/unread-count ────────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Mensajes realmente no leídos
    const realUnread = await Message.countDocuments({
      receiver: userId,
      read: false,
      deletedFor: { $ne: userId },
    });

    // Conversaciones marcadas como no leídas manualmente
    const markedUnread = await ConversationMeta.countDocuments({
      userId,
      markedUnread: true,
      deleted: false,
    });

    res.json({ unreadCount: realUnread + markedUnread });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    res.status(500).json({ message: 'Error al obtener no leídos' });
  }
};

// ── PATCH /api/messages/:conversationId/read ──────────────────
const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    const result = await Message.updateMany(
      { conversationId, receiver: userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { markedUnread: false } },
      { upsert: true }
    );

    res.json({ markedRead: result.modifiedCount });
  } catch (err) {
    console.error('markAsRead error:', err);
    res.status(500).json({ message: 'Error al marcar como leído' });
  }
};

// ── PATCH /api/messages/:conversationId/archive ───────────────
const archiveConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { archived: true } },
      { upsert: true }
    );

    res.json({ message: 'Conversación archivada' });
  } catch (err) {
    console.error('archiveConversation error:', err);
    res.status(500).json({ message: 'Error al archivar' });
  }
};

// ── PATCH /api/messages/:conversationId/unarchive ─────────────
const unarchiveConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { archived: false } },
      { upsert: true }
    );

    res.json({ message: 'Conversación desarchivada' });
  } catch (err) {
    console.error('unarchiveConversation error:', err);
    res.status(500).json({ message: 'Error al desarchivar' });
  }
};

// ── DELETE /api/messages/:conversationId — Eliminar para mí ───
const deleteConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    // Marcar todos los mensajes como eliminados para este usuario
    await Message.updateMany(
      { conversationId },
      { $addToSet: { deletedFor: userId } }
    );

    // Marcar meta como eliminada
    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { deleted: true, archived: false, pinned: false } },
      { upsert: true }
    );

    res.json({ message: 'Conversación eliminada para vos' });
  } catch (err) {
    console.error('deleteConversation error:', err);
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

// ── PATCH /api/messages/:conversationId/pin ───────────────────
const pinConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    // Máximo 3 fijadas
    const pinnedCount = await ConversationMeta.countDocuments({ userId, pinned: true });
    const current = await ConversationMeta.findOne({ conversationId, userId });

    if (!current?.pinned && pinnedCount >= 3) {
      return res.status(400).json({ message: 'Máximo 3 conversaciones fijadas' });
    }

    const newPinned = current?.pinned ? false : true; // toggle

    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { pinned: newPinned } },
      { upsert: true }
    );

    res.json({ message: newPinned ? 'Conversación fijada' : 'Conversación desfijada', pinned: newPinned });
  } catch (err) {
    console.error('pinConversation error:', err);
    res.status(500).json({ message: 'Error al fijar' });
  }
};

// ── PATCH /api/messages/:conversationId/mark-unread ───────────
const markUnread = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    await ConversationMeta.findOneAndUpdate(
      { conversationId, userId },
      { $set: { markedUnread: true } },
      { upsert: true }
    );

    res.json({ message: 'Marcada como no leída' });
  } catch (err) {
    console.error('markUnread error:', err);
    res.status(500).json({ message: 'Error al marcar' });
  }
};

module.exports = {
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
};