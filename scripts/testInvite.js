/**
 * Test the invite flow end-to-end
 * Run: node scripts/testInvite.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

async function test() {
  console.log('\n=== Email Config ===');
  console.log('GMAIL_USER:', process.env.GMAIL_USER || 'NOT SET');
  console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? `*** (${process.env.GMAIL_APP_PASSWORD.length} chars)` : 'NOT SET');

  // Test SMTP
  console.log('\n=== SMTP Test ===');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP OK');
  } catch (err) {
    console.error('❌ SMTP Failed:', err.message);
  }

  // Test MongoDB + check for existing users
  console.log('\n=== MongoDB Test ===');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
    const User = require('../models/User');
    const count = await User.countDocuments();
    console.log('Total users:', count);
    const users = await User.find().select('name email role status').lean();
    users.forEach(u => console.log(` - ${u.email} [${u.role}] ${u.status}`));
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ MongoDB failed:', err.message);
  }
}

test().catch(console.error);
