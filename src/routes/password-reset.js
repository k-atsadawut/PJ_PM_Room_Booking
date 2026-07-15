import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { hashPassword } from '../utils/password';
import { executeQuery } from '../config/db';
import { sendEmail } from '../utils/mailer';

const passwordReset = new Hono();

// 6-digit OTP generator (เหมือนใน otp.js)
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/forgot-password — ส่ง OTP ไปอีเมล + แจ้งเตือน admin (ไม่ต้องอนุมัติ)
passwordReset.post('/', async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง (invalid JSON body)' }, 400);
  }

  const { email } = body;
  if (!email) {
    return c.json({ error: 'กรุณาระบุอีเมล' }, 400);
  }

  const users = await executeQuery(
    'SELECT UserID, Name FROM users WHERE Email = ? LIMIT 1',
    [email],
    c.env
  );

  // Security: ไม่เปิดเผยว่าอีเมลมีในระบบหรือไม่ — ส่ง 200 เสมอ
  if (users.length > 0) {
    const user = users[0];
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 นาที

    // เก็บ OTP Type='password_reset'
    await executeQuery(
      'INSERT INTO otp_codes (UserID, Email, Code, Type, ExpiresAt) VALUES (?, ?, ?, ?, ?)',
      [user.UserID, email, otp, 'password_reset', expiresAt.toISOString().slice(0, 19).replace('T', ' ')],
      c.env
    );

    // ส่ง OTP อีเมล
    await sendEmail({
      to: email,
      subject: 'OTP สำหรับรีเซ็ตรหัสผ่าน',
      text: `เรียน ${user.Name},\n\nรหัส OTP สำหรับรีเซ็ตรหัสผ่านของคุณคือ:\n\n${otp}\n\nรหัสนี้จะหมดอายุใน 10 นาที\nหากคุณไม่ได้ขอรหัสนี้ กรุณาละเว้น\n\nระบบจองห้อง`,
    }, c.env);

    // บันทึกคำขอเป็น audit log (status='auto-processed' เพราะไม่ต้องอนุมัติแล้ว)
    await executeQuery(
      'INSERT INTO password_reset_requests (UserID, Email, Status) VALUES (?, ?, ?)',
      [user.UserID, email, 'auto-processed'],
      c.env
    );

    // แจ้งเตือน admin (notification record, ให้ทราบเท่านั้น ไม่ต้องอนุมัติ)
    const admins = await executeQuery("SELECT UserID FROM users WHERE Role = 'admin'", [], c.env);
    for (const a of admins) {
      await executeQuery(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [a.UserID, null, `ผู้ใช้ ${email} ขอรีเซ็ตรหัสผ่าน (ยืนยันผ่าน OTP แล้ว)`],
        c.env
      );
    }
  }

  return c.json({ success: true, message: 'หากอีเมลนี้มีในระบบ ระบบได้ส่ง OTP ไปแล้ว' });
});

// POST /api/forgot-password/verify-otp — ตรวจ OTP แล้วออก reset token (public)
passwordReset.post('/verify-otp', async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400);
  }

  const { email, code } = body;
  if (!email || !code) {
    return c.json({ error: 'กรุณาระบุอีเมลและ OTP' }, 400);
  }

  const otpRecord = await executeQuery(
    "SELECT * FROM otp_codes WHERE Email = ? AND Code = ? AND Type = 'password_reset' AND Used = 0 AND ExpiresAt > NOW() ORDER BY CreatedAt DESC LIMIT 1",
    [email, code],
    c.env
  );

  if (otpRecord.length === 0) {
    return c.json({ error: 'OTP ไม่ถูกต้อง หรือหมดอายุ' }, 400);
  }

  // mark Used=1
  await executeQuery(
    'UPDATE otp_codes SET Used = 1 WHERE OTPID = ?',
    [otpRecord[0].OTPID],
    c.env
  );

  // ออก reset token (5 นาที) เก็บใน KV
  const otpToken = crypto.randomUUID();
  await c.env.SESSIONS.put(
    `reset-token:${otpToken}`,
    JSON.stringify({ userId: otpRecord[0].UserID, usedAt: Date.now() }),
    { expirationTtl: 300 }
  );

  return c.json({ success: true, otpToken });
});

// POST /api/forgot-password/reset — เปลี่ยนรหัสผ่านด้วย reset token (public)
passwordReset.post('/reset', async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400);
  }

  const { otpToken, newPassword } = body;

  // ตรวจ token
  const dataRaw = otpToken ? await c.env.SESSIONS.get(`reset-token:${otpToken}`) : null;
  if (!dataRaw) {
    return c.json({ error: 'เซสชันหมดอายุ กรุณาขอ OTP ใหม่' }, 403);
  }
  const { userId } = JSON.parse(dataRaw);

  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);
  }

  // hash + update password
  const hashedPassword = await hashPassword(newPassword);
  await executeQuery(
    'UPDATE users SET Password = ?, force_change_password = 0 WHERE UserID = ?',
    [hashedPassword, userId],
    c.env
  );

  // ใช้แล้วทิ้ง (one-time use)
  await c.env.SESSIONS.delete(`reset-token:${otpToken}`);

  return c.json({ success: true });
});

// GET /api/forgot-password — ดูสถานะคำขอของตัวเอง (เดิม สำหรับ user ที่ login)
passwordReset.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT * FROM password_reset_requests
    WHERE UserID = ?
    ORDER BY RequestDate DESC
  `, [session.user.id], c.env);

  return c.json(result);
});

export default passwordReset;
