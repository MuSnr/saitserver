const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { getPolicies, createPolicy, updatePolicy, deletePolicy } = require('../controllers/PolicyController');
const { bulkImportPolicies, downloadPoliciesTemplate } = require('../controllers/PolicyBulkController');
const { protect, authorize } = require('../middleware/auth');

const docUpload = require('../middleware/upload');

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls and .csv files are supported.'), ok);
  },
});

router.get('/',          protect, getPolicies);
router.get('/template',  protect, downloadPoliciesTemplate);
router.post('/',         protect, authorize('admin', 'campus_manager'), docUpload.array('documents', 10), createPolicy);
router.post('/bulk',     protect, authorize('admin', 'campus_manager'), bulkUpload.single('file'), bulkImportPolicies);
router.put('/:id',       protect, authorize('admin', 'campus_manager'), docUpload.array('documents', 10), updatePolicy);
router.delete('/:id',    protect, authorize('admin'), deletePolicy);

module.exports = router;
