const express = require('express');
const router = express.Router();
const { getDashboardAnalytics } = require('../controllers/DashboardController');
const { protect } = require('../middleware/auth');

router.get('/analytics', protect, getDashboardAnalytics);

module.exports = router;
