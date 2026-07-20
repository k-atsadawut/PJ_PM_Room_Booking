import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const notifications = new Hono();

// GET /api/notifications — ดูการแจ้งเตือนของตัวเอง
notifications.get('/', requireAuth, async (c) => {
  const session = c.get('session');
  
  const result = await executeQuery(`
    SELECT n.*, b.BookingDate, b.StartTime, b.EndTime, r.RoomName
    FROM notifications n
    LEFT JOIN bookings b ON n.BookingID = b.BookingID
    LEFT JOIN rooms r ON b.RoomID = r.RoomID
    WHERE n.UserID = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `, [session.user.id], c.env);

  return c.json(result);
});

// PATCH /api/notifications/:id/read — ทำเครื่องหมายว่าอ่านแล้ว
notifications.patch('/:id/read', requireAuth, async (c) => {
  const session = c.get('session');
  const notificationId = c.req.param('id');

  await executeQuery(
    "UPDATE notifications SET IsRead = 1 WHERE NotificationID = ? AND UserID = ?",
    [notificationId, session.user.id],
    c.env
  );

  return c.json({ success: true });
});

// PATCH /api/notifications/read-all — ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว
notifications.patch('/read-all', requireAuth, async (c) => {
  const session = c.get('session');

  await executeQuery(
    "UPDATE notifications SET IsRead = 1 WHERE UserID = ?",
    [session.user.id],
    c.env
  );

  return c.json({ success: true });
});

// GET /api/notifications/unread-count — จำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
notifications.get('/unread-count', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(
    "SELECT COUNT(*) as count FROM notifications WHERE UserID = ? AND IsRead = 0",
    [session.user.id],
    c.env
  );

  return c.json({ count: result[0].count });
});

export default notifications;
