const express = require('express');
const router = express.Router();
const { getClaims, createClaim, updateClaim, deleteClaim } = require('../controllers/ClaimController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', protect, getClaims);
router.post('/', protect, upload.array('documents', 10), createClaim);
router.put('/:id', protect, authorize('admin', 'campus_manager'), updateClaim);
router.delete('/:id', protect, authorize('admin'), deleteClaim);

module.exports = router;
