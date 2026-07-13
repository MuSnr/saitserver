const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { getRecords, createRecord, updateRecord, deleteRecord } = require('../controllers/InsuranceController');
const { bulkImportInsurance, downloadInsuranceTemplate } = require('../controllers/InsuranceBulkController');
const { protect, authorize } = require('../middleware/auth');

// Memory storage for bulk uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls and .csv files are supported.'), ok);
  },
});

router.get('/',          protect, getRecords);
router.get('/template',  protect, downloadInsuranceTemplate);
router.post('/',         protect, authorize('admin'), upload.array('documents', 10), createRecord);
router.post('/bulk',     protect, authorize('admin', 'campus_manager'), upload.single('file'), bulkImportInsurance);
router.put('/:id',       protect, authorize('admin'), updateRecord);
router.delete('/:id',   protect, authorize('admin'), deleteRecord);

module.exports = router;
