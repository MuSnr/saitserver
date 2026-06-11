const express = require('express');
const router = express.Router();
const { getRecords, createRecord, updateRecord, deleteRecord } = require('../controllers/InsuranceController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', protect, getRecords);
router.post('/', protect, authorize('admin', 'campus_manager'), upload.array('documents', 10), createRecord);
router.put('/:id', protect, authorize('admin', 'campus_manager'), updateRecord);
router.delete('/:id', protect, authorize('admin'), deleteRecord);

module.exports = router;
