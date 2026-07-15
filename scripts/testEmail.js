/**
 * Test email connectivity
 * Run: node scripts/testEmail.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const nodemailer = require('nodemailer');

async function test() {
  console.log('Testing email config...');
  console.log('GMAIL_USER:', process.env.GMAIL_USER || 'NOT SET');
  console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '*** set (' + process.env.GMAIL_APP_PASSWORD.length + ' chars)' : 'NOT SET');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    console.log('\nVerifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection OK — credentials are valid');

    console.log('\nSending test email to:', process.env.GMAIL_USER);
    await transporter.sendMail({
      from: `"SAIT Test" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: 'SAIT Email Test',
      text: 'If you receive this, email is working correctly.',
    });
    console.log('✅ Test email sent successfully — check your inbox');
  } catch (err) {
    console.error('❌ Email failed:', err.message);
    if (err.message.includes('Invalid login') || err.message.includes('Username and Password')) {
      console.error('\n→ App Password is wrong or 2FA is not enabled on the Gmail account');
      console.error('→ Go to: Google Account → Security → 2-Step Verification → App Passwords');
      console.error('→ Generate a new App Password for "Mail" and update GMAIL_APP_PASSWORD in .env');
    }
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      console.error('\n→ Network/firewall is blocking outbound SMTP (port 465/587)');
    }
  }
}

test();
