const express = require('express');
const router = express.Router();
const { getSettings, upsertSetting, bulkUpsert } = require('../controllers/SettingController');
const { protect, authorize } = require('../middleware/auth');

// All authenticated users can read settings (e.g. escalation rate)
router.get('/', protect, getSettings);

// Only admins can write
router.put('/', protect, authorize('admin'), upsertSetting);
router.put('/bulk', protect, authorize('admin'), bulkUpsert);

module.exports = router;
