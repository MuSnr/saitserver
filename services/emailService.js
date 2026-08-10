const nodemailer = require('nodemailer');
const logger = require('./logger');

const createTransporter = () => nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: { rejectUnauthorized: false },
});

const FROM_NAME = 'Nova Pioneer — SAIT Platform';

async function sendEmail({ to, subject, html }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"${FROM_NAME}" <${process.env.GMAIL_USER}>`,
    to, subject, html,
  });
  logger.info(`Email sent to ${to}: ${subject}`);
}

const wrap = (body) => `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#0A1628;padding:28px 32px;text-align:center;">
      <span style="color:white;font-weight:bold;font-size:20px;">SAIT &nbsp;·&nbsp; Nova Pioneer</span>
    </div>
    <div style="padding:40px 32px;">${body}</div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">© 2026 Nova Pioneer Schools · SAIT Asset Reconciliation Platform</p>
    </div>
  </div>
</body></html>`

const btn = (url, label) =>
  `<div style="text-align:center;margin:32px 0;">
     <a href="${url}" style="background:#4ADE80;color:#0A1628;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">${label}</a>
   </div>
   <p style="color:#6b7280;font-size:11px;">Or copy: <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a></p>`

const sendPasswordResetEmail = async (email, name, _token, resetUrl) => {
  try {
    await sendEmail({
      to: email,
      subject: 'SAIT — Password Reset Request',
      html: wrap(`
        <h2 style="color:#0A1628;">Password Reset</h2>
        <p style="color:#6b7280;">Hi ${name},</p>
        <p style="color:#374151;">Click below to reset your password. Expires in <strong>1 hour</strong>.</p>
        ${btn(resetUrl, 'Reset My Password')}
      `),
    });
    return true;
  } catch (err) {
    logger.error(`Password reset email failed for ${email}:`, err);
    throw err;
  }
};

const sendAccountApprovedEmail = async (email, name) => {
  try {
    const loginUrl = `${process.env.FRONTEND_URL || 'https://saitdashboard.vercel.app'}/login`;
    await sendEmail({
      to: email,
      subject: 'SAIT — Your Account Has Been Approved',
      html: wrap(`
        <h2 style="color:#0A1628;">Welcome to SAIT!</h2>
        <p style="color:#374151;">Hi ${name}, your account is approved. You can now log in.</p>
        ${btn(loginUrl, 'Log In Now')}
      `),
    });
    return true;
  } catch (err) {
    logger.error(`Approval email failed for ${email}:`, err);
    return false;
  }
};

const sendNewUserNotificationToAdmin = async (adminEmail, newUserName, newUserEmail) => {
  try {
    await sendEmail({
      to: adminEmail,
      subject: 'SAIT — New User Registration Pending Approval',
      html: wrap(`
        <h3 style="color:#0A1628;">New User Registration</h3>
        <p style="color:#374151;">A new user is awaiting approval:</p>
        <ul style="color:#374151;">
          <li><strong>Name:</strong> ${newUserName}</li>
          <li><strong>Email:</strong> ${newUserEmail}</li>
        </ul>
        <p>Log in to SAIT Admin to approve or reject.</p>
      `),
    });
  } catch (err) {
    logger.error('Admin notification failed:', err);
  }
};

const sendInviteEmail = async (email, name, inviteUrl, invitedByName) => {
  try {
    await sendEmail({
      to: email,
      subject: 'SAIT — You have been invited to Nova Pioneer',
      html: wrap(`
        <h2 style="color:#0A1628;">You're invited to SAIT</h2>
        <p style="color:#6b7280;">Hi ${name},</p>
        <p style="color:#374151;">${invitedByName} has invited you to join the SAIT Asset Reconciliation Platform at Nova Pioneer.<br>Click below to set your password.</p>
        ${btn(inviteUrl, 'Set My Password')}
        <p style="color:#9ca3af;font-size:12px;">This link expires in 7 days.</p>
      `),
    });
    return true;
  } catch (err) {
    logger.error(`Invite email failed for ${email}:`, err);
    throw err;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendNewUserNotificationToAdmin,
  sendInviteEmail,
};
