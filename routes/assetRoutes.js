const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { getAssets, createAsset, updateAsset, deleteAsset } = require('../controllers/AssetController');
const { bulkImport } = require('../controllers/BulkImportController');
const { downloadTemplate } = require('../controllers/TemplateController');
const { protect, authorize } = require('../middleware/auth');

// Memory storage — file goes into req.file.buffer, no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls and .csv files are supported.'), ok);
  },
});

router.get('/',           protect, getAssets);
router.get('/template',   protect, downloadTemplate);
router.post('/',          protect, authorize('admin', 'campus_manager'), createAsset);
router.post('/bulk',      protect, authorize('admin', 'campus_manager'), upload.single('file'), bulkImport);
router.put('/:id',        protect, authorize('admin', 'campus_manager'), updateAsset);
router.delete('/:id',     protect, authorize('admin'), deleteAsset);

module.exports = router;
