/**
 * Get the invite/reset link for a user by email
 * Usage: node scripts/getInviteLink.js user@email.com
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

async function run() {
  const targetEmail = process.argv[2];
  if (!targetEmail) { console.log('Usage: node scripts/getInviteLink.js <email>'); process.exit(1); }

  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');

  const user = await User.findOne({ email: targetEmail.toLowerCase() })
    .select('+resetPasswordToken +resetPasswordExpires').lean();

  if (!user) { console.log('User not found:', targetEmail); process.exit(1); }

  console.log('\nUser found:', user.name, '|', user.email, '|', user.role);
  console.log('Status:', user.status);

  if (user.resetPasswordToken && user.resetPasswordExpires > Date.now()) {
    // Token is already in DB but we don't have the raw token — generate a new one
    console.log('\nGenerating fresh invite link...');
  }

  // Generate a new fresh token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  await User.findByIdAndUpdate(user._id, {
    resetPasswordToken: hashedToken,
    resetPasswordExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://saitdashboard.vercel.app';
  const link = `${FRONTEND_URL}/reset-password/${rawToken}`;

  console.log('\n✅ Fresh invite link (valid 7 days):');
  console.log(link);
  console.log('\nShare this link directly with the user to set their password.');

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
