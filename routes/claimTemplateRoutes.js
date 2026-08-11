const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
} = require('../controllers/ClaimTemplateController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/',         protect, getTemplates);
router.post('/',        protect, authorize('admin'), upload.single('pdf'), createTemplate);
router.put('/:id',      protect, authorize('admin'), upload.single('pdf'), updateTemplate);
router.delete('/:id',   protect, authorize('admin'), deleteTemplate);

module.exports = router;
