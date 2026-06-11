const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../services/logger');
const {
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendNewUserNotificationToAdmin,
} = require('../services/emailService');

// ── Helpers ───────────────────────────────────────────────────────────────────

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });

const sanitizeUser = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  region: user.region,
  campus: user.campus,
  status: user.status,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
});

// ── Register ──────────────────────────────────────────────────────────────────

const register = async (req, res) => {
  try {
    const { name, email, password, role, region, campus } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'viewer',
      region: region || '',
      campus: campus || '',
      status: 'pending', // awaits admin approval
    });

    // Notify all admins
    try {
      const admins = await User.find({ role: 'admin', status: 'active' }).select('email');
      for (const admin of admins) {
        await sendNewUserNotificationToAdmin(admin.email, name, email);
      }
    } catch (e) {
      logger.warn('Could not notify admins of new registration:', e.message);
    }

    logger.info(`New user registered: ${email} (pending approval)`);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully. An administrator will review and approve your account.',
    });
  } catch (err) {
    logger.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── Login ─────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn(`Failed login attempt for ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. You will be notified by email once approved.',
      });
    }
    if (user.status === 'inactive' || user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Contact an administrator.',
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);

    logger.info(`User logged in: ${email} (role: ${user.role})`);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    logger.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── Get current user (me) ─────────────────────────────────────────────────────

const getMe = async (req, res) => {
  return res.status(200).json({ success: true, user: sanitizeUser(req.user) });
};

// ── Get all users (admin only) ────────────────────────────────────────────────

const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password -resetPasswordToken -resetPasswordExpires').sort({ createdAt: -1 });
    return res.status(200).json({ success: true, users });
  } catch (err) {
    logger.error('Get users error:', err);
    return res.status(500).json({ success: false, message: 'Error retrieving users.' });
  }
};

// ── Create user by admin ──────────────────────────────────────────────────────

const createUser = async (req, res) => {
  try {
    const { name, email, password, role, region, campus } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password || 'Welcome@123', 12);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'viewer',
      region: region || '',
      campus: campus || '',
      status: 'active', // admin-created users are active immediately
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
    });

    logger.info(`Admin ${req.user.email} created user: ${email}`);
    return res.status(201).json({ success: true, message: 'User created successfully.', user: sanitizeUser(user) });
  } catch (err) {
    logger.error('Create user error:', err);
    return res.status(500).json({ success: false, message: 'Error creating user.' });
  }
};

// ── Update user ───────────────────────────────────────────────────────────────

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, region, campus, status } = req.body;

    // Non-admins can only update their own profile (name/email only)
    if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
      return res.status(403).json({ success: false, message: 'You can only update your own profile.' });
    }

    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase().trim();
    if (req.user.role === 'admin') {
      if (role) updates.role = role;
      if (region !== undefined) updates.region = region;
      if (campus !== undefined) updates.campus = campus;
      if (status) updates.status = status;
    }

    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    logger.info(`User ${id} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'User updated.', user });
  } catch (err) {
    logger.error('Update user error:', err);
    return res.status(500).json({ success: false, message: 'Error updating user.' });
  }
};

// ── Delete user (admin only) ──────────────────────────────────────────────────

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    logger.info(`User ${id} (${user.email}) deleted by admin ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'User deleted.' });
  } catch (err) {
    logger.error('Delete user error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting user.' });
  }
};

// ── Admin: approve / reject account ──────────────────────────────────────────

const approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' | 'reject'

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (action === 'approve') {
      user.status = 'active';
      user.verifiedBy = req.user._id;
      user.verifiedAt = new Date();
      await user.save();
      await sendAccountApprovedEmail(user.email, user.name);
      logger.info(`Admin ${req.user.email} approved user ${user.email}`);
      return res.status(200).json({ success: true, message: 'User approved and notified by email.' });
    } else if (action === 'reject') {
      user.status = 'suspended';
      await user.save();
      logger.info(`Admin ${req.user.email} rejected user ${user.email}`);
      return res.status(200).json({ success: true, message: 'User account rejected.' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action. Use "approve" or "reject".' });
    }
  } catch (err) {
    logger.error('Approve user error:', err);
    return res.status(500).json({ success: false, message: 'Error processing account action.' });
  }
};

// ── Forgot password ───────────────────────────────────────────────────────────

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetPasswordToken +resetPasswordExpires');
    if (!user) {
      // Security: don't reveal if email exists
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    try {
      await sendPasswordResetEmail(user.email, user.name, resetToken, resetUrl);
    } catch (emailErr) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      logger.error('Email send failed during forgot password:', emailErr);
      return res.status(500).json({ success: false, message: 'Failed to send reset email. Please try again.' });
    }

    logger.info(`Password reset email sent to ${email}`);
    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  } catch (err) {
    logger.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── Reset password ────────────────────────────────────────────────────────────

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.' });
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    logger.info(`Password reset successful for ${user.email}`);
    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    logger.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── Change password (authenticated) ──────────────────────────────────────────

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    logger.info(`Password changed for ${user.email}`);
    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    logger.error('Change password error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
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
};
