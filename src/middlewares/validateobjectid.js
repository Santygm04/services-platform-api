const mongoose = require('mongoose');

// Valida que req.params[paramName] sea un ObjectId válido antes de llegar al controller
const validateObjectId = (paramName = 'id') => (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
    return res.status(400).json({ message: `${paramName} inválido` });
  }
  next();
};

module.exports = validateObjectId;