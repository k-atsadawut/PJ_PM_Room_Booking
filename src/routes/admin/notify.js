import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { executeQuery } from '../../config/db';
import { sendEmail } from '../../utils/mailer';

const adminNotify = new Hono();

// POST /api/admin/notify/send — admin ส่งอีเมลแจ้งเตือนหาผู้ใช้
// body: { to: UserID[], subject: string, body: string }
adminNotify.post('/send', requireAdmin, async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง (invalid JSON body)' }, 400);
  }

  const { to, subject, body: text } = body;

  // Validate
  if (!Array.isArray(to) || to.length === 0) {
    return c.json({ error: 'กรุณาเลือกผู้รับอย่างน้อย 1 คน' }, 400);
  }
  if (!subject || !subject.trim()) {
    return c.json({ error: 'กรุณาระบุหัวข้ออีเมล' }, 400);
  }
  if (!text || !text.trim()) {
    return c.json({ error: 'กรุณาระบุเนื้อหาอีเมล' }, 400);
  }

  // จำกัดจำนวนผู้รับต่อครั้ง เพื่อกัน abuse
  const MAX_RECIPIENTS = 500;
  const recipientIds = to.slice(0, MAX_RECIPIENTS);

  // ดึง Email+Name จาก DB เอง (ไม่ไว้ใจอีเมลจากฝั่ง client)
  // mysql2 รองรับ ?? สำหรับ identifier และ ? สำหรับ value
  const placeholders = recipientIds.map(() => '?').join(',');
  const users = await executeQuery(
    `SELECT UserID, Name, Email FROM users WHERE UserID IN (${placeholders})`,
    recipientIds,
    c.env
  );

  if (users.length === 0) {
    return c.json({ error: 'ไม่พบผู้รับที่ถูกต้อง' }, 400);
  }

  // ส่งทีละคน เพื่อ isolate error และรายงานผลรายบุคคล
  const failed = [];
  let sent = 0;

  for (const u of users) {
    const result = await sendEmail(
      { to: u.Email, subject: subject.trim(), text: text.trim() },
      c.env
    );
    if (result.success) {
      sent++;
    } else {
      failed.push({ userId: u.UserID, email: u.Email, error: result.error });
    }
  }

  return c.json({ success: true, sent, failed });
});

export default adminNotify;
