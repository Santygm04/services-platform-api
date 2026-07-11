const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authmiddleware');
const { authorizeRoles, authorizeSection } = require('../middlewares/rolemiddleware');
const {
  getPublicConfig,
  adminGetConfig,
  adminUpdateConfig,
} = require('../controllers/siteconfigcontroller');

router.get('/', getPublicConfig); // pública — sin auth

router.get('/admin',   protect, authorizeRoles('admin'), authorizeSection('config'), adminGetConfig);
router.patch('/admin', protect, authorizeRoles('admin'), authorizeSection('config'), adminUpdateConfig);

module.exports = router;