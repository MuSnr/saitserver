require('dotenv').config();
const nodemailer = require('nodemailer');

async function test() {
  console.log('Testing Resend SMTP...');
  console.log('API Key:', process.env.RESEND_API_KEY ? '*** set' : 'NOT SET');
  console.log('From:', process.env.GMAIL_USER);

  const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
      user: 'resend',
      pass: process.env.RESEND_API_KEY,
    },
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP connection OK');

    const info = await transporter.sendMail({
      from: `"SAIT · Nova Pioneer" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: 'SAIT — Resend SMTP Test',
      html: '<p>If you received this, Resend SMTP is working. Invites will now deliver immediately.</p>',
    });

    console.log('✅ Email sent! Message ID:', info.messageId);
    console.log('Check inbox at:', process.env.GMAIL_USER);
  } catch (err) {
    console.error('❌ Failed:', err.message);
  }
}

test();
