const express = require('express');
const router = express.Router();
const { getVarianceReport, getClaimsReport, getAssetsReport } = require('../controllers/ReportController');
const { protect } = require('../middleware/auth');

router.get('/variance', protect, getVarianceReport);
router.get('/claims',   protect, getClaimsReport);
router.get('/assets',   protect, getAssetsReport);

module.exports = router;
