const express = require('express');
const router = express.Router();
const { getCampuses, createCampus, updateCampus, deleteCampus } = require('../controllers/CampusController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getCampuses);
router.post('/', protect, authorize('admin'), createCampus);
router.put('/:id', protect, authorize('admin'), updateCampus);
router.delete('/:id', protect, authorize('admin'), deleteCampus);

module.exports = router;
