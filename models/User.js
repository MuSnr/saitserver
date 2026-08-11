const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'campus_manager', 'viewer'],
      default: 'viewer',
    },
    region: {
      type: String,
      enum: ['South Africa', 'Kenya'],
      default: 'South Africa',
    },
    campus: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'suspended'],
      default: 'pending', // requires admin approval before can login
    },
    // Password reset
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    // Invite link — stored so admin can retrieve it anytime
    pendingInviteUrl: { type: String, default: '' },
    // Account verification by admin
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    unreadNotifications: { type: Number, default: 0 },
    savedSignature: { type: String, default: '' },  // base64 PNG — user's saved signature
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
