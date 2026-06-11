const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'campus_manager', 'viewer'],
      default: 'viewer',
    },
    region: { type: String, default: '' },
    campus: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'suspended'],
      default: 'pending', // requires admin approval before can login
    },
    // Password reset
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    // Account verification by admin
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
