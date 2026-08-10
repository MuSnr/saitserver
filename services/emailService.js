const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const logger = require('./logger');

// ── Resend (primary — reliable on Vercel serverless) ─────────────────────────
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── Nodemailer fallback (local dev / when Resend not configured) ──────────────
const createTransporter = () => nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  tls: { rejectUnauthorized: false },
});

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.GMAIL_USER || 'noreply@novapioneer.com';
const FROM_NAME  = 'SAIT · Nova Pioneer';

// ── Shared send helper ────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (resendClient) {
    const { error } = await resendClient.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    if (error) throw new Error(error.message);
    logger.info(`Email sent via Resend to ${to}: ${subject}`);
  } else {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${process.env.GMAIL_USER}>`,
      to, subject, html,
    });
    logger.info(`Email sent via Nodemailer to ${to}: ${subject}`);
  }
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
const wrap = (body) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#0A1628;padding:28px 32px;text-align:center;">
      <span style="color:white;font-weight:bold;font-size:20px;letter-spacing:1px;">SAIT &nbsp;·&nbsp; Nova Pioneer</span>
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
   <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-top:16px;">
     <p style="color:#6b7280;font-size:11px;margin:0;">Or copy this link into your browser:</p>
     <p style="color:#2563eb;font-size:11px;word-break:break-all;margin:4px 0 0 0;">${url}</p>
   </div>`

// ── Email functions ───────────────────────────────────────────────────────────

const sendPasswordResetEmail = async (email, name, _resetToken, resetUrl) => {
  try {
    await sendEmail({
      to: email,
      subject: 'SAIT — Password Reset Request',
      html: wrap(`
        <h2 style="color:#0A1628;margin:0 0 8px 0;">Password Reset Request</h2>
        <p style="color:#6b7280;">Hi ${name},</p>
        <p style="color:#374151;">Click below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        ${btn(resetUrl, 'Reset My Password')}
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">If you didn't request this, you can safely ignore this email.</p>
      `),
    });
    return true;
  } catch (err) {
    logger.error(`Failed to send password reset email to ${email}:`, err);
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
        <p style="color:#374151;">Hi ${name}, your account has been approved. You can now log in.</p>
        ${btn(loginUrl, 'Log In Now')}
      `),
    });
    return true;
  } catch (err) {
    logger.error(`Failed to send approval email to ${email}:`, err);
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
        <p style="color:#374151;">A new user is awaiting your approval:</p>
        <ul style="color:#374151;">
          <li><strong>Name:</strong> ${newUserName}</li>
          <li><strong>Email:</strong> ${newUserEmail}</li>
        </ul>
        <p style="color:#374151;">Log in to the SAIT Admin panel to approve or reject this account.</p>
      `),
    });
  } catch (err) {
    logger.error('Failed to notify admin of new user:', err);
  }
};

const sendInviteEmail = async (email, name, inviteUrl, invitedByName) => {
  try {
    await sendEmail({
      to: email,
      subject: 'SAIT — You have been invited to Nova Pioneer',
      html: wrap(`
        <h2 style="color:#0A1628;margin:0 0 8px 0;">You're invited to SAIT</h2>
        <p style="color:#6b7280;">Hi ${name},</p>
        <p style="color:#374151;">${invitedByName} has invited you to join the SAIT Asset Reconciliation Platform at Nova Pioneer.<br>Click below to set your password and activate your account.</p>
        ${btn(inviteUrl, 'Set My Password')}
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">This link expires in <strong>7 days</strong>. If you weren't expecting this, you can safely ignore it.</p>
      `),
    });
    return true;
  } catch (err) {
    logger.error(`Failed to send invite email to ${email}:`, err);
    throw err;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendNewUserNotificationToAdmin,
  sendInviteEmail,
};
