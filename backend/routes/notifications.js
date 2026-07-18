const express = require('express');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// GET /api/notifications — ดูการแจ้งเตือนของผู้ใช้ปัจจุบัน (FR-12)
// Admin จะเห็นการแจ้งเตือนที่ส่งถึงตนเอง (FR-11)
router.get('/', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  const [rows] = await db.execute(`
    SELECT
      n.NotificationID,
      n.UserID,
      n.BookingID,
      n.Message,
      n.IsRead,
      n.created_at
    FROM notifications n
    WHERE n.UserID = ?
    ORDER BY n.created_at DESC, n.NotificationID DESC
    LIMIT 100
  `, [userId]);

  res.json(rows);
});

// PATCH /api/notifications/:id/read — ทำเครื่องหมายว่าอ่านแล้ว
router.patch('/:id/read', requireAuth, async (req, res) => {
  const id = req.params.id;
  const userId = req.session.user.id;

  await db.execute(
    'UPDATE notifications SET IsRead = 1 WHERE NotificationID = ? AND UserID = ?',
    [id, userId]
  );

  res.json({ success: true });
});

// PATCH /api/notifications/read-all — ทำเครื่องหมายทั้งหมดว่าอ่านแล้ว
router.patch('/read-all', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  await db.execute(
    'UPDATE notifications SET IsRead = 1 WHERE UserID = ?',
    [userId]
  );

  res.json({ success: true });
});

module.exports = router;
