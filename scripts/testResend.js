require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function test() {
  console.log('Testing Resend...');
  console.log('API Key:', process.env.RESEND_API_KEY ? '*** set' : 'NOT SET');

  const { data, error } = await resend.emails.send({
    from: 'SAIT · Nova Pioneer <onboarding@resend.dev>',
    to: process.env.GMAIL_USER, // sends to cmuteti@novapioneer.com
    subject: 'SAIT Email Test via Resend',
    html: '<p>If you received this, Resend is working correctly. Emails will now deliver reliably.</p>',
  });

  if (error) {
    console.error('❌ Resend failed:', error);
  } else {
    console.log('✅ Resend OK — Email sent, ID:', data.id);
    console.log('Check your inbox at', process.env.GMAIL_USER);
  }
}

test().catch(console.error);
