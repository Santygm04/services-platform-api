const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles } = require('../middlewares/rolemiddleware');
const {
  getPublicConfig,
  adminGetConfig,
  adminUpdateConfig,
} = require('../controllers/siteconfigcontroller');

router.get('/', getPublicConfig); // pública — sin auth

router.get('/admin',   protect, authorizeRoles('admin'), adminGetConfig);
router.patch('/admin', protect, authorizeRoles('admin'), adminUpdateConfig);

module.exports = router;