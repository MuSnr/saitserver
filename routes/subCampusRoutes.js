const express = require('express');
const router = express.Router();
const {
  getSubCampuses,
  createSubCampus,
  updateSubCampus,
  deleteSubCampus,
} = require('../controllers/SubCampusController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getSubCampuses);
router.post('/', protect, authorize('admin'), createSubCampus);
router.put('/:id', protect, authorize('admin'), updateSubCampus);
router.delete('/:id', protect, authorize('admin'), deleteSubCampus);

module.exports = router;
