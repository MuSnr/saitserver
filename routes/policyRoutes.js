const express = require('express');
const router = express.Router();
const { getPolicies, createPolicy, updatePolicy, deletePolicy } = require('../controllers/PolicyController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', protect, getPolicies);
router.post('/', protect, authorize('admin', 'campus_manager'), upload.array('documents', 10), createPolicy);
router.put('/:id', protect, authorize('admin', 'campus_manager'), upload.array('documents', 10), updatePolicy);
router.delete('/:id', protect, authorize('admin'), deletePolicy);

module.exports = router;
