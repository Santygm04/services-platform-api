const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['provider', 'review'], required: true },
  targetId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    enum: ['spam', 'fake', 'offensive', 'harassment', 'wrong_category', 'other'],
    required: true,
  },
  description: { type: String, maxlength: 500 },
  status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending' },
  adminNotes: { type: String },
  resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt:  { type: Date },
}, { timestamps: true });

// Un usuario no puede reportar el mismo target dos veces
reportSchema.index({ reportedBy: 1, targetType: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);