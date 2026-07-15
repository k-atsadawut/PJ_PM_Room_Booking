import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const passwordReset = new Hono();

// POST /api/forgot-password — ส่งคำขอรีเซ็ตรหัสผ่าน
passwordReset.post('/', async (c) => {
  const { email } = await c.req.json();

  if (!email) {
    return c.json({ error: 'กรุณาระบุอีเมล' }, 400);
  }

  const users = await executeQuery(
    'SELECT UserID FROM users WHERE Email = ? LIMIT 1',
    [email],
    c.env
  );

  if (users.length === 0) {
    return c.json({ error: 'ไม่พบอีเมลนี้ในระบบ' }, 404);
  }

  const userId = users[0].UserID;

  const result = await executeQuery(
    'INSERT INTO password_reset_requests (UserID, Email, Status) VALUES (?, ?, ?)',
    [userId, email, 'pending'],
    c.env
  );

  const requestId = result.insertId;

  // Notify admins about the password reset request
  const admins = await executeQuery("SELECT UserID FROM users WHERE Role = 'admin'", [], c.env);
  if (admins.length > 0) {
    const notifValues = admins.map(a => [
      a.UserID,
      null,
      `มีคำขอรีเซ็ตรหัสผ่านจาก ${email} รอการอนุมัติ`,
    ]);
    
    for (const notif of notifValues) {
      await executeQuery(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [notif[0], notif[1], notif[2]],
        c.env
      );
    }
  }

  return c.json({ success: true, requestId });
});

// GET /api/forgot-password — ดูสถานะคำขอของตัวเอง
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
