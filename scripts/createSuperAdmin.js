/**
 * One-time script to create the first super_admin user.
 *
 * Usage:
 *   node scripts/createSuperAdmin.js
 *
 * Set credentials via environment variables or edit the defaults below.
 * The script is idempotent — safe to run multiple times.
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');

const SUPER_ADMIN_EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@novapioneer.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@2025!';
const SUPER_ADMIN_NAME     = process.env.SUPER_ADMIN_NAME     || 'Super Admin';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL.toLowerCase() });

  if (existing) {
    if (existing.role !== 'super_admin') {
      existing.role = 'super_admin';
      existing.status = 'active';
      await existing.save();
      console.log(`Updated ${SUPER_ADMIN_EMAIL} → role: super_admin`);
    } else {
      console.log(`super_admin already exists: ${SUPER_ADMIN_EMAIL}`);
    }
    await mongoose.disconnect();
    return;
  }

  const password = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

  await User.create({
    name:   SUPER_ADMIN_NAME,
    email:  SUPER_ADMIN_EMAIL.toLowerCase().trim(),
    password,
    role:   'super_admin',
    region: 'South Africa',
    status: 'active',
  });

  console.log(`\n✅  super_admin created successfully`);
  console.log(`   Email:    ${SUPER_ADMIN_EMAIL}`);
  console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
  console.log('\n⚠️  Change the password immediately after first login!\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
