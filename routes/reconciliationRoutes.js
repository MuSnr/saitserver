const express = require('express');
const router = express.Router();
const {
  getReconciliation,
  linkRecords,
  unlinkRecord,
  getSuggestions,
  runAutoLink,
} = require('../controllers/ReconciliationController');
const { protect, authorize } = require('../middleware/auth');

// All reconciliation routes require authentication
router.get('/',                          protect, getReconciliation);
router.post('/link',                     protect, authorize('admin', 'campus_manager'), linkRecords);
router.delete('/link/:assetId',          protect, authorize('admin', 'campus_manager'), unlinkRecord);
router.get('/suggestions/:assetId',      protect, getSuggestions);
router.post('/auto-link',                protect, authorize('admin'), runAutoLink);

module.exports = router;
