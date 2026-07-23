const mongoose = require('mongoose');

// ── Modelo Message ────────────────────────────────────────────
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Usuarios que "eliminaron" este mensaje de su vista
    deletedFor: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ receiver: 1, read: 1 });
messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.statics.getConversationId = function (userA, userB) {
  const ids = [userA.toString(), userB.toString()].sort();
  return `${ids[0]}_${ids[1]}`;
};

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// ── Modelo ConversationMeta (metadatos por usuario por conversación) ──
const conversationMetaSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    markedUnread: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationMetaSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

const ConversationMeta = mongoose.models.ConversationMeta || mongoose.model('ConversationMeta', conversationMetaSchema);

module.exports = Message;
module.exports.ConversationMeta = ConversationMeta;