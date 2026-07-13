const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const {
  getIncidents, getIncidentById, createIncident,
  updateIncident, deleteIncident, convertToClaim,
} = require('../controllers/IncidentController');
const { protect, authorize } = require('../middleware/auth');

// Memory storage for evidence uploads (Vercel-compatible)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|jpg|jpeg|png|mp4)$/i.test(file.originalname);
    cb(allowed ? null : new Error('Unsupported file type'), allowed);
  },
});

router.get('/',                protect, getIncidents);
router.get('/:id',             protect, getIncidentById);
router.post('/',               protect, authorize('admin', 'campus_manager'), upload.array('evidence', 10), createIncident);
router.put('/:id',             protect, authorize('admin', 'campus_manager'), updateIncident);
router.post('/:id/convert',   protect, authorize('admin', 'campus_manager'), convertToClaim);
router.delete('/:id',          protect, authorize('admin'), deleteIncident);

module.exports = router;
