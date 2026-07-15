const express = require('express');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { hasExistingBookingForDate } = require('../utils/bookingRules');
const { notifyAdminNewBooking } = require('../utils/mailer');
const { checkAndNotifyQueue } = require('./queues');
const router  = express.Router();

const OPEN_TIME  = '08:30';
const CLOSE_TIME = '17:00';

// GET /api/bookings — ดูการจองของตัวเอง
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT b.*, r.RoomName
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    WHERE b.UserID = ?
    ORDER BY b.BookingDate DESC, b.StartTime DESC
  `, [req.session.user.id]);

  res.json(rows);
});

// POST /api/bookings — สร้างการจอง
router.post('/', requireAuth, async (req, res) => {
  const { roomId, date, start, end } = req.body;

  if (!roomId || !date || !start || !end) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  // FR-01: เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น
  if (start >= end) {
    return res.status(400).json({ error: 'เวลาสิ้นสุดการจองต้องอยู่หลังเวลาเริ่มต้น' });
  }

  // FR-05: เวลาทำการ 08:30–17:00
  if (start < OPEN_TIME || end > CLOSE_TIME) {
    return res.status(400).json({ error: 'สามารถจองห้องได้เฉพาะในช่วงเวลาทำการ 08:30 น. ถึง 17:00 น. เท่านั้น' });
  }

  // FR-02: ป้องกันการจองย้อนหลัง และอนุญาตให้จองล่วงหน้าได้
  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    return res.status(400).json({ error: 'ไม่สามารถจองห้องย้อนหลังได้ กรุณาเลือกวันที่ปัจจุบันหรือวันข้างหน้า' });
  }

  // FR-05: เลยเวลาปิดแล้ว (เฉพาะกรณีจองวันปัจจุบัน)
  if (date === today) {
    const nowTime = new Date().toTimeString().slice(0, 5);
    if (nowTime >= CLOSE_TIME) {
      return res.status(400).json({ error: 'เลยเวลาทำการสำหรับการจองห้องในวันนี้แล้ว (หลัง 17:00 น.) โปรดเลือกจองล่วงหน้าในวันอื่นแทน' });
    }
  }

  // FR-06: เสาร์-อาทิตย์
  const dow = new Date(date + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) {
    return res.status(400).json({ error: 'ระบบไม่เปิดให้จองห้องในวันเสาร์และวันอาทิตย์' });
  }

  // FR-12: วันหยุดพิเศษ
  const [holidays] = await db.execute(
    'SELECT HolidayID FROM holidays WHERE HolidayDate = ? LIMIT 1', [date]
  );
  if (holidays.length > 0) {
    return res.status(400).json({ error: 'วันที่เลือกเป็นวันหยุดพิเศษของมหาวิทยาลัย จึงไม่เปิดให้บริการจองห้อง' });
  }

  // FR-03: ตรวจ conflict
  const [conflicts] = await db.execute(`
    SELECT BookingID FROM bookings
    WHERE RoomID = ?
      AND BookingDate = ?
      AND Status IN ('pending','approved')
      AND StartTime < ? AND EndTime > ?
    LIMIT 1
  `, [roomId, date, end, start]);

  if (conflicts.length > 0) {
    return res.status(400).json({ error: 'ช่วงเวลานี้มีผู้จองไว้แล้ว กรุณาเลือกช่วงเวลาอื่นที่ว่าง' });
  }

  // BR-06 / FR-06: one booking per user per day
  const [userBookings] = await db.execute(`
    SELECT BookingDate, Status FROM bookings
    WHERE UserID = ?
      AND BookingDate = ?
      AND Status IN ('pending','approved')
  `, [req.session.user.id, date]);

  if (hasExistingBookingForDate(userBookings, date)) {
    return res.status(400).json({ error: 'คุณมีการจองหรือคำขอจองในวันนี้แล้ว ระบบจำกัดให้จองได้เพียง 1 ครั้งต่อวันเท่านั้น' });
  }

  // สร้างการจอง
  const [result] = await db.execute(`
    INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `, [req.session.user.id, roomId, date, start, end]);

  const bookingId = result.insertId;

  // FR-09: แจ้ง Admin (notification ในระบบ)
  const [admins] = await db.execute("SELECT UserID, Email FROM users WHERE Role = 'admin'");
  const [room]   = await db.execute("SELECT RoomName FROM rooms WHERE RoomID = ?", [roomId]);
  const roomName = room[0]?.RoomName || roomId;

  if (admins.length > 0) {
    const notifValues = admins.map(a => [
      a.UserID,
      bookingId,
      `มีคำขอจองห้อง ${roomName} วันที่ ${date} เวลา ${start}–${end} รอการอนุมัติ`,
    ]);
    await db.query(
      'INSERT INTO notifications (UserID, BookingID, Message) VALUES ?',
      [notifValues]
    );

    // FR-11: ส่งอีเมลแจ้ง Admin
    const [user] = await db.execute("SELECT Name, Email FROM users WHERE UserID = ?", [req.session.user.id]);
    admins.forEach(admin => {
      if (admin.Email) {
        notifyAdminNewBooking({
          RoomName: roomName,
          RoomID: roomId,
          BookingDate: date,
          StartTime: start,
          EndTime: end,
          UserName: user[0]?.Name,
          UserEmail: user[0]?.Email,
        }, admin.Email).catch(err => console.error('Email error:', err));
      }
    });
  }

  res.json({ success: true, bookingId });
});

// PATCH /api/bookings/:id/cancel — ยกเลิกการจอง (FR-08)
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM bookings WHERE BookingID = ? AND UserID = ? LIMIT 1',
    [req.params.id, req.session.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบการจองนี้' });
  if (!['pending', 'approved'].includes(rows[0].Status)) {
    return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ในสถานะนี้' });
  }

  const booking = rows[0];

  await db.execute(
    "UPDATE bookings SET Status = 'cancelled' WHERE BookingID = ?",
    [req.params.id]
  );

  // FR-13 / BR-15: ตรวจสอบคิวและแจ้งเตือนคนที่รออยู่
  checkAndNotifyQueue(booking.RoomID, booking.BookingDate, booking.StartTime, booking.EndTime);

  res.json({ success: true });
});

module.exports = router;
