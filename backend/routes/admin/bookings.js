const express = require('express');
const db      = require('../../config/db');
const { requireAdmin } = require('../../middleware/auth');
const { notifyUserBookingStatus } = require('../../utils/mailer');
const { checkAndNotifyQueue } = require('../queues');
const router  = express.Router();

// GET /api/admin/bookings
router.get('/', requireAdmin, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT b.*, r.RoomName, u.Name AS UserName, u.Email AS UserEmail
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    JOIN users u ON b.UserID = u.UserID
    ORDER BY b.created_at DESC
    LIMIT 200
  `);
  res.json(rows);
});

// PATCH /api/admin/bookings/:id — approve หรือ reject
router.patch('/:id', requireAdmin, async (req, res) => {
  const { action } = req.body; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'action ต้องเป็น approved หรือ rejected' });
  }

  const [rows] = await db.execute(
    "SELECT * FROM bookings WHERE BookingID = ? AND Status = 'pending' LIMIT 1",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบการจองที่รอดำเนินการ' });

  await db.execute(
    'UPDATE bookings SET Status = ? WHERE BookingID = ?',
    [action, req.params.id]
  );

  // แจ้งเจ้าของการจอง
  const b = rows[0];
  const msg = action === 'approved'
    ? `การจองห้อง ${b.RoomID} วันที่ ${b.BookingDate} เวลา ${b.StartTime}–${b.EndTime} ได้รับการอนุมัติแล้ว`
    : `การจองห้อง ${b.RoomID} วันที่ ${b.BookingDate} เวลา ${b.StartTime}–${b.EndTime} ถูกปฏิเสธ`;

  await db.execute(
    'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
    [b.UserID, b.BookingID, msg]
  );

  // FR-12: ส่งอีเมลแจ้งผู้จอง
  const [user] = await db.execute("SELECT Email FROM users WHERE UserID = ?", [b.UserID]);
  const [room] = await db.execute("SELECT RoomName FROM rooms WHERE RoomID = ?", [b.RoomID]);
  
  if (user[0]?.Email) {
    notifyUserBookingStatus({
      RoomName: room[0]?.RoomName || b.RoomID,
      RoomID: b.RoomID,
      BookingDate: b.BookingDate,
      StartTime: b.StartTime,
      EndTime: b.EndTime,
    }, user[0].Email, action).catch(err => console.error('Email error:', err));
  }

  // FR-13 / BR-15: ถ้า reject ให้ตรวจสอบคิวและแจ้งเตือนคนที่รออยู่
  if (action === 'rejected') {
    checkAndNotifyQueue(b.RoomID, b.BookingDate, b.StartTime, b.EndTime);
  }

  res.json({ success: true });
});

module.exports = router;
