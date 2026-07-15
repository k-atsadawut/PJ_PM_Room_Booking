import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';
import { sendOTPEmail } from '../utils/mailer';

const otpRoutes = new Hono();

// Helper function to generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to check if OTP is expired
function isOTPExpired(expiresAt) {
  return new Date(expiresAt) < new Date();
}

// POST /api/otp/send - Send OTP to user's email for password change
otpRoutes.post('/send', requireAuth, async (c) => {
  const session = c.get('session');
  const userId = session.user.id;
  
  // Get user email
  const user = await executeQuery(
    'SELECT Email, Name FROM users WHERE UserID = ?',
    [userId],
    c.env
  );
  
  if (user.length === 0) {
    return c.json({ error: 'ไม่พบผู้ใช้' }, 404);
  }
  
  const userEmail = user[0].Email;
  const userName = user[0].Name;
  
  // Generate OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
  
  // Store OTP in database
  await executeQuery(
    'INSERT INTO otp_codes (UserID, Email, Code, Type, ExpiresAt) VALUES (?, ?, ?, ?, ?)',
    [userId, userEmail, otp, 'password_change', expiresAt.toISOString().slice(0, 19).replace('T', ' ')],
    c.env
  );
  
  // Send OTP email
  const emailResult = await sendOTPEmail({
    to: userEmail,
    name: userName,
    otp: otp
  }, c.env);
  
  if (!emailResult.success) {
    console.error('Failed to send OTP email:', emailResult.error);
    return c.json({ error: 'ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่' }, 500);
  }
  
  return c.json({ success: true, message: 'ส่ง OTP ไปยังอีเมลของคุณแล้ว' });
});

// POST /api/otp/verify - Verify OTP code
otpRoutes.post('/verify', requireAuth, async (c) => {
  const session = c.get('session');
  const userId = session.user.id;
  const { code } = await c.req.json();

  if (!code) {
    return c.json({ error: 'กรุณาระบุ OTP' }, 400);
  }

  // Get valid OTP from database
  const otpRecord = await executeQuery(
    'SELECT * FROM otp_codes WHERE UserID = ? AND Code = ? AND Type = ? AND Used = 0 AND ExpiresAt > NOW() ORDER BY CreatedAt DESC LIMIT 1',
    [userId, code, 'password_change'],
    c.env
  );

  if (otpRecord.length === 0) {
    return c.json({ error: 'OTP ไม่ถูกต้อง หรือหมดอายุ' }, 400);
  }

  // Mark OTP as used
  await executeQuery(
    'UPDATE otp_codes SET Used = 1 WHERE OTPID = ?',
    [otpRecord[0].OTPID],
    c.env
  );

  // Issue a short-lived, one-time-use token stored in KV.
  // /api/auth/change-password requires this token (server-side check),
  // so the OTP gate can no longer be bypassed by calling the API directly.
  const otpToken = crypto.randomUUID();
  await c.env.SESSIONS.put(
    `otp-verified:${otpToken}`,
    JSON.stringify({ userId, usedAt: Date.now() }),
    { expirationTtl: 300 } // 5 minutes
  );

  return c.json({ success: true, otpToken, message: 'OTP ถูกต้อง' });
});

// POST /api/otp/resend - Resend OTP
otpRoutes.post('/resend', requireAuth, async (c) => {
  const session = c.get('session');
  const userId = session.user.id;
  
  // Get user email
  const user = await executeQuery(
    'SELECT Email, Name FROM users WHERE UserID = ?',
    [userId],
    c.env
  );
  
  if (user.length === 0) {
    return c.json({ error: 'ไม่พบผู้ใช้' }, 404);
  }
  
  const userEmail = user[0].Email;
  const userName = user[0].Name;
  
  // Generate new OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
  
  // Store OTP in database
  await executeQuery(
    'INSERT INTO otp_codes (UserID, Email, Code, Type, ExpiresAt) VALUES (?, ?, ?, ?, ?)',
    [userId, userEmail, otp, 'password_change', expiresAt.toISOString().slice(0, 19).replace('T', ' ')],
    c.env
  );
  
  // Send OTP email
  const emailResult = await sendOTPEmail({
    to: userEmail,
    name: userName,
    otp: otp
  }, c.env);
  
  if (!emailResult.success) {
    console.error('Failed to send OTP email:', emailResult.error);
    return c.json({ error: 'ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่' }, 500);
  }
  
  return c.json({ success: true, message: 'ส่ง OTP ใหม่ไปยังอีเมลของคุณแล้ว' });
});

export default otpRoutes;
