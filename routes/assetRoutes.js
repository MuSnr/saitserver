const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { getAssets, createAsset, updateAsset, deleteAsset } = require('../controllers/AssetController');
const { bulkImport } = require('../controllers/BulkImportController');
const { downloadTemplate } = require('../controllers/TemplateController');
const { protect, authorize } = require('../middleware/auth');
const { uploadToCloudinary } = require('../services/uploadService');
const logger = require('../services/logger');

// Memory storage for bulk import (Excel/CSV)
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls and .csv files are supported.'), ok);
  },
});

// Memory storage for document/invoice uploads (PDF, images)
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF, JPG and PNG files are supported.'), ok);
  },
});

// ── Document upload endpoint ──────────────────────────────────────────────────
// POST /api/assets/upload-document
// Accepts a single file, uploads to Cloudinary, returns the secure URL
router.post('/upload-document',
  protect,
  authorize('admin', 'campus_manager'),
  docUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided.' });
      }
      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(503).json({ success: false, message: 'File upload not configured. Use a URL link instead.' });
      }
      const url = await uploadToCloudinary(req.file.buffer, req.file.originalname, 'sait/documents');
      return res.status(200).json({ success: true, url });
    } catch (err) {
      logger.error('Document upload error:', err);
      return res.status(500).json({ success: false, message: 'Upload failed. Try using a URL link instead.' });
    }
  }
);

router.get('/',          protect, getAssets);
router.get('/template',  protect, downloadTemplate);
router.post('/',         protect, authorize('admin', 'campus_manager'), createAsset);
router.post('/bulk',     protect, authorize('admin'), bulkUpload.single('file'), bulkImport);
router.put('/:id',       protect, authorize('admin', 'campus_manager'), updateAsset);
router.delete('/:id',    protect, authorize('admin'), deleteAsset);

module.exports = router;
