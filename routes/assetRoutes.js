const express = require('express');
const router = express.Router();
const { getAssets, createAsset, updateAsset, deleteAsset } = require('../controllers/AssetController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getAssets);
router.post('/', protect, authorize('admin', 'campus_manager'), createAsset);
router.put('/:id', protect, authorize('admin', 'campus_manager'), updateAsset);
router.delete('/:id', protect, authorize('admin'), deleteAsset);

module.exports = router;
