const mongoose = require('mongoose');
const adminLogSchema = new mongoose.Schema({
  adminId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminName:  { type: String },
  action:     { type: String, required: true },
  targetType: { type: String },
  targetId:   { type: String },
  targetName: { type: String },
  detail:     { type: String },
}, { timestamps: true });
module.exports = mongoose.models.AdminLog || mongoose.model('AdminLog', adminLogSchema);