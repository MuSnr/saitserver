const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  approveUser,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/UserController');
const { protect, authorize } = require('../middleware/auth');
const { authLimiter, resetLimiter } = require('../middleware/rateLimiter');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', resetLimiter, forgotPassword);
router.post('/reset-password/:token', resetPassword);

// ── Authenticated — specific paths BEFORE /:id wildcard ──────────────────────
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);   // must be before /:id

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/', protect, authorize('admin'), getUsers);
router.post('/', protect, authorize('admin'), createUser);

// ── Parameterised (/:id) — last to avoid swallowing named routes ──────────────
router.put('/:id/approve', protect, authorize('admin'), approveUser);
router.put('/:id', protect, updateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);

module.exports = router;
