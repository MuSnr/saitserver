const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { getClaims, createClaim, updateClaim, deleteClaim } = require('../controllers/ClaimController');
const { bulkImportClaims, downloadClaimsTemplate } = require('../controllers/ClaimBulkController');
const { protect, authorize } = require('../middleware/auth');

const docUpload = require('../middleware/upload'); // existing multer for doc attachments

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls and .csv files are supported.'), ok);
  },
});

router.get('/',          protect, getClaims);
router.get('/template',  protect, downloadClaimsTemplate);
router.post('/',         protect, docUpload.array('documents', 10), createClaim);
router.post('/bulk',     protect, authorize('admin', 'campus_manager'), bulkUpload.single('file'), bulkImportClaims);
router.put('/:id',       protect, authorize('admin', 'campus_manager'), updateClaim);
router.delete('/:id',    protect, authorize('admin'), deleteClaim);

module.exports = router;
