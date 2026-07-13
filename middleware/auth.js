const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../services/logger');

/**
 * Verify JWT and attach user to req.user
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    const user = await User.findById(decoded.id).select('-password -resetPasswordToken -resetPasswordExpires');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User account no longer exists.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
    }
    if (user.status === 'inactive' || user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact an administrator.' });
    }

    req.user = user;
    next(); // ← was commented out — this caused ALL protected routes to hang
  } catch (err) {
    logger.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
};

/**
 * RBAC — allow only specified roles
 * Usage: authorize('admin', 'campus_manager')
 * Note: super_admin is always permitted regardless of roles listed.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    // super_admin bypasses all role restrictions
    if (req.user.role === 'super_admin') return next();
    if (!roles.includes(req.user.role)) {
      logger.warn(
        `RBAC denied: user ${req.user.email} (role: ${req.user.role}) tried to access route requiring [${roles.join(', ')}]`
      );
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
