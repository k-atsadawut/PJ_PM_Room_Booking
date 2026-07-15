import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { hashPassword } from '../utils/password';
import { executeQuery } from '../config/db';
import { sendEmail } from '../utils/mailer';

const passwordReset = new Hono();

function generateResetToken() {
  return crypto.randomUUID();
}

// POST /api/forgot-password — ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมล
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
    const resetToken = generateResetToken();

    await c.env.SESSIONS.put(
      `reset-token:${resetToken}`,
      JSON.stringify({ userId: user.UserID, createdAt: Date.now() }),
      { expirationTtl: 600 }
    );

    const requestUrl = new URL(c.req.url);
    const resetLink = `${requestUrl.protocol}//${requestUrl.host}/forgot-password.html?resetToken=${resetToken}`;

    await sendEmail({
      to: email,
      subject: 'ลิงก์รีเซ็ตรหัสผ่าน',
      text: `เรียน ${user.Name},\n\nเราได้รับคำขอรีเซ็ตรหัสผ่านของคุณแล้ว\n\nกรุณาคลิกลิงก์ต่อไปนี้เพื่อเปลี่ยนรหัสผ่าน:\n\n${resetLink}\n\nลิงก์นี้จะใช้ได้ภายใน 10 นาที\nหากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน กรุณาละเว้นอีเมลนี้\n\nระบบจองห้อง`,
    }, c.env);

    await executeQuery(
      'INSERT INTO password_reset_requests (UserID, Email, Status) VALUES (?, ?, ?)',
      [user.UserID, email, 'auto-processed'],
      c.env
    );

    const admins = await executeQuery("SELECT UserID FROM users WHERE Role = 'admin'", [], c.env);
    for (const a of admins) {
      await executeQuery(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [a.UserID, null, `ผู้ใช้ ${email} ขอรีเซ็ตรหัสผ่าน (ส่งลิงก์แล้ว)`],
        c.env
      );
    }
  }

  return c.json({ success: true, message: 'หากอีเมลนี้มีในระบบ ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว' });
});

// POST /api/forgot-password/reset — เปลี่ยนรหัสผ่านด้วย reset token (public)
passwordReset.post('/reset', async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400);
  }

  const { resetToken, newPassword } = body;
  const dataRaw = resetToken ? await c.env.SESSIONS.get(`reset-token:${resetToken}`) : null;
  if (!dataRaw) {
    return c.json({ error: 'ลิงก์หมดอายุ กรุณาขอรีเซ็ตรหัสผ่านใหม่' }, 403);
  }
  const { userId } = JSON.parse(dataRaw);

  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);
  }

  const hashedPassword = await hashPassword(newPassword);
  await executeQuery(
    'UPDATE users SET Password = ?, force_change_password = 0 WHERE UserID = ?',
    [hashedPassword, userId],
    c.env
  );

  await c.env.SESSIONS.delete(`reset-token:${resetToken}`);

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
