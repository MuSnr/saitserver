const nodemailer = require('nodemailer');
const logger = require('./logger');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,        // STARTTLS on port 587
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, name, resetToken, resetUrl) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"SAIT Platform" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'SAIT — Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: #0A1628; padding: 32px; text-align: center;">
              <div style="display: inline-flex; align-items: center; gap: 12px;">
                <div style="background: #4ADE80; width: 40px; height: 40px; border-radius: 10px; display: inline-block; text-align: center; line-height: 40px; font-weight: bold; color: #0A1628; font-size: 14px;">SA</div>
                <span style="color: white; font-weight: bold; font-size: 20px;">SAIT</span>
              </div>
            </div>
            <div style="padding: 40px 32px;">
              <h2 style="color: #0A1628; margin: 0 0 8px 0;">Password Reset Request</h2>
              <p style="color: #6b7280; margin: 0 0 24px 0;">Hi ${name},</p>
              <p style="color: #374151; margin: 0 0 24px 0;">
                We received a request to reset the password for your SAIT account. Click the button below to set a new password.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="background: #4ADE80; color: #0A1628; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Reset My Password
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
                This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
              </p>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-top: 24px;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">Or copy this link into your browser:</p>
                <p style="color: #2563eb; font-size: 12px; word-break: break-all; margin: 4px 0 0 0;">${resetUrl}</p>
              </div>
            </div>
            <div style="background: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2025 Nova Pioneer · SAIT Asset Reconciliation Platform</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${email}`);
    return true;
  } catch (err) {
    logger.error(`Failed to send password reset email to ${email}:`, err);
    throw err;
  }
};

/**
 * Send account approval notification
 */
const sendAccountApprovedEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173/login';

    const mailOptions = {
      from: `"SAIT Platform" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'SAIT — Your Account Has Been Approved',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: #0A1628; padding: 32px; text-align: center;">
              <div style="background: #4ADE80; width: 40px; height: 40px; border-radius: 10px; display: inline-block; text-align: center; line-height: 40px; font-weight: bold; color: #0A1628; font-size: 14px;">SA</div>
              <span style="color: white; font-weight: bold; font-size: 20px; margin-left: 10px; vertical-align: middle;">SAIT</span>
            </div>
            <div style="padding: 40px 32px;">
              <h2 style="color: #0A1628; margin: 0 0 8px 0;">Welcome to SAIT!</h2>
              <p style="color: #374151; margin: 0 0 24px 0;">
                Hi ${name}, your account has been approved by an administrator. You can now log in to access the platform.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${loginUrl}" style="background: #4ADE80; color: #0A1628; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Log In Now
                </a>
              </div>
            </div>
            <div style="background: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2025 Nova Pioneer · SAIT Asset Reconciliation Platform</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Account approved email sent to ${email}`);
    return true;
  } catch (err) {
    logger.error(`Failed to send approval email to ${email}:`, err);
    // Don't throw — not critical
    return false;
  }
};

/**
 * Send new user registration notification to admin
 */
const sendNewUserNotificationToAdmin = async (adminEmail, newUserName, newUserEmail) => {
  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"SAIT Platform" <${process.env.GMAIL_USER}>`,
      to: adminEmail,
      subject: 'SAIT — New User Registration Pending Approval',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px;">
          <h3 style="color: #0A1628;">New User Registration</h3>
          <p>A new user has registered and is awaiting your approval:</p>
          <ul>
            <li><strong>Name:</strong> ${newUserName}</li>
            <li><strong>Email:</strong> ${newUserEmail}</li>
          </ul>
          <p>Log in to the SAIT Admin panel to approve or reject this account.</p>
        </div>
      `,
    });
    logger.info(`Admin notified of new user registration: ${newUserEmail}`);
  } catch (err) {
    logger.error('Failed to notify admin of new user:', err);
  }
};

/**
 * Send account invitation to a new user created by admin
 */
const sendInviteEmail = async (email, name, inviteUrl, invitedByName) => {
  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"SAIT Platform" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'SAIT — You have been invited',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: #0A1628; padding: 32px; text-align: center;">
              <div style="display: inline-flex; align-items: center; gap: 12px;">
                <div style="background: #4ADE80; width: 40px; height: 40px; border-radius: 10px; display: inline-block; text-align: center; line-height: 40px; font-weight: bold; color: #0A1628; font-size: 14px;">SA</div>
                <span style="color: white; font-weight: bold; font-size: 20px;">SAIT</span>
              </div>
            </div>
            <div style="padding: 40px 32px;">
              <h2 style="color: #0A1628; margin: 0 0 8px 0;">You're invited to SAIT</h2>
              <p style="color: #6b7280; margin: 0 0 24px 0;">Hi ${name},</p>
              <p style="color: #374151; margin: 0 0 24px 0;">
                ${invitedByName} has invited you to join the SAIT Asset Reconciliation Platform at Nova Pioneer.
                Click the button below to set your password and activate your account.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}" style="background: #4ADE80; color: #0A1628; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Set My Password
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
                This link expires in <strong>7 days</strong>. If you weren't expecting this, you can safely ignore it.
              </p>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-top: 24px;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">Or copy this link into your browser:</p>
                <p style="color: #2563eb; font-size: 12px; word-break: break-all; margin: 4px 0 0 0;">${inviteUrl}</p>
              </div>
            </div>
            <div style="background: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2025 Nova Pioneer · SAIT Asset Reconciliation Platform</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    logger.info(`Invite email sent to ${email}`);
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
