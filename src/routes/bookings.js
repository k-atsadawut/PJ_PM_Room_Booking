import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { hasExistingBookingForDate } from '../utils/bookingRules';
import { notifyAdminNewBooking } from '../utils/mailer';
import { checkAndNotifyQueue } from './queues';
import { executeQuery } from '../config/db';

const bookings = new Hono();

const OPEN_TIME = '08:30';
const CLOSE_TIME = '17:00';
const MAX_BOOKING_HOURS_DEFAULT = 3; // FR-23 (SRS v3.0)

// คำนวณชั่วโมงระหว่าง "HH:MM" สองค่า (end - start)
function diffHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

// Helper function to get next available day (not holiday, not weekend)
async function getNextAvailableDay(startDate, env) {
  let currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1); // Start checking from tomorrow
  
  for (let i = 0; i < 7; i++) { // Check up to 7 days ahead
    const dateStr = currentDate.toISOString().split('T')[0];
    const dow = currentDate.getDay();
    
    // Skip weekends
    if (dow === 0 || dow === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }
    
    // Check if it's a holiday
    const holiday = await executeQuery(
      'SELECT HolidayID FROM holidays WHERE HolidayDate = ? LIMIT 1',
      [dateStr],
      env
    );
    
    if (holiday.length === 0) {
      return dateStr; // Found available day
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return startDate; // Fallback to original date if no available day found
}

// GET /api/bookings — ดูการจองของตัวเอง
bookings.get('/', requireAuth, async (c) => {
  const session = c.get('session');
  
  const result = await executeQuery(`
    SELECT b.*, r.RoomName
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    WHERE b.UserID = ?
    ORDER BY b.BookingDate DESC, b.StartTime DESC
  `, [session.user.id], c.env);

  return c.json(result);
});

// POST /api/bookings — สร้างการจอง
bookings.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { roomId, date, start, end } = await c.req.json();

  if (!roomId || !date || !start || !end) {
    return c.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, 400);
  }

  // FR-01: เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น
  if (start >= end) {
    return c.json({ error: 'เวลาสิ้นสุดการจองต้องอยู่หลังเวลาเริ่มต้น' }, 400);
  }

  // FR-23: จำกัดการจองสูงสุด 3 ชั่วโมงต่อวัน (SRS v3.0 Proposed)
  const MAX_BOOKING_HOURS = Number(c.env?.MAX_BOOKING_HOURS) || 3;
  const durationHours = diffHours(start, end);
  if (durationHours > MAX_BOOKING_HOURS) {
    return c.json({
      error: `ระบบจำกัดการจองสูงสุด ${MAX_BOOKING_HOURS} ชั่วโมงต่อครั้ง (FR-23) กรุณาลดระยะเวลาการจอง`,
    }, 400);
  }

  // FR-05: เวลาทำการ 08:30–17:00
  if (start < OPEN_TIME || end > CLOSE_TIME) {
    return c.json({ error: 'สามารถจองห้องได้เฉพาะในช่วงเวลาทำการ 08:30 น. ถึง 17:00 น. เท่านั้น' }, 400);
  }

  // FR-02 (SRS v3.0): จองได้เฉพาะ "วันปัจจุบัน" เท่านั้น (ไม่อนุญาตย้อนหลัง/ล่วงหน้า)
  const today = new Date().toISOString().split('T')[0];
  if (date !== today) {
    return c.json({
      error: date < today
        ? 'ไม่สามารถจองห้องย้อนหลังได้ กรุณาเลือกวันที่ปัจจุบัน'
        : 'ระบบรับจองเฉพาะวันปัจจุบันเท่านั้น ไม่รองรับการจองล่วงหน้า (FR-02)',
    }, 400);
  }

  // FR-05: เลยเวลาปิดแล้ว (เฉพาะกรณีจองวันปัจจุบัน)
  if (date === today) {
    const nowTime = new Date().toTimeString().slice(0, 5);
    if (nowTime >= CLOSE_TIME) {
      return c.json({ error: 'เลยเวลาทำการสำหรับการจองห้องในวันนี้แล้ว (หลัง 17:00 น.) โปรดเลือกจองล่วงหน้าในวันอื่นแทน' }, 400);
    }
  }

  // FR-06: เสาร์-อาทิตย์
  const dow = new Date(date + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) {
    return c.json({ error: 'ระบบไม่เปิดให้จองห้องในวันเสาร์และวันอาทิตย์' }, 400);
  }

  // FR-12: วันหยุดพิเศษ
  const holidays = await executeQuery(
    'SELECT HolidayID FROM holidays WHERE HolidayDate = ? LIMIT 1',
    [date],
    c.env
  );
  
  if (holidays.length > 0) {
    return c.json({ error: 'วันที่เลือกเป็นวันหยุดพิเศษของมหาวิทยาลัย จึงไม่เปิดให้บริการจองห้อง' }, 400);
  }

  // FR-03: ตรวจ conflict
  const conflicts = await executeQuery(`
    SELECT BookingID FROM bookings
    WHERE RoomID = ?
      AND BookingDate = ?
      AND Status IN ('pending','approved')
      AND StartTime < ? AND EndTime > ?
    LIMIT 1
  `, [roomId, date, end, start], c.env);

  if (conflicts.length > 0) {
    return c.json({ error: 'ช่วงเวลานี้มีผู้จองไว้แล้ว กรุณาเลือกช่วงเวลาอื่นที่ว่าง' }, 400);
  }

  // BR-06 / FR-06: one booking per user per day
  const userBookings = await executeQuery(`
    SELECT BookingDate, Status FROM bookings
    WHERE UserID = ?
      AND BookingDate = ?
      AND Status IN ('pending','approved')
  `, [session.user.id, date], c.env);

  if (hasExistingBookingForDate(userBookings, date)) {
    return c.json({ error: 'คุณมีการจองหรือคำขอจองในวันนี้แล้ว ระบบจำกัดให้จองได้เพียง 1 ครั้งต่อวันเท่านั้น' }, 400);
  }

  // FR-07: สถานะเริ่มต้น = 'pending' (รออนุมัติ) — ไม่ auto-approve
  // (ก่อนหน้านี้ตั้งเป็น 'approved' ทำให้ FR-07/FR-11/FR-12 ล้มเหลว)
  const result = await executeQuery(`
    INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `, [session.user.id, roomId, date, start, end], c.env);

  const bookingId = result.insertId;

  // FR-11: แจ้ง Admin (notification ในระบบ) ทุกครั้งที่มีคำขอใหม่
  const admins = await executeQuery("SELECT UserID, Email FROM users WHERE Role = 'admin'", [], c.env);
  const room = await executeQuery("SELECT RoomName FROM rooms WHERE RoomID = ?", [roomId], c.env);
  const roomName = room[0]?.RoomName || roomId;

  if (admins.length > 0) {
    const notifValues = admins.map(a => [
      a.UserID,
      bookingId,
      `มีคำขอจองห้อง ${roomName} วันที่ ${date} เวลา ${start}–${end} รอการอนุมัติ`,
    ]);
    
    for (const notif of notifValues) {
      await executeQuery(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [notif[0], notif[1], notif[2]],
        c.env
      );
    }

    // FR-11: ส่งอีเมลแจ้ง Admin
    const user = await executeQuery("SELECT Name, Email FROM users WHERE UserID = ?", [session.user.id], c.env);
    
    for (const admin of admins) {
      if (admin.Email) {
        notifyAdminNewBooking({
          RoomName: roomName,
          RoomID: roomId,
          BookingDate: date,
          StartTime: start,
          EndTime: end,
          UserName: user[0]?.Name,
          UserEmail: user[0]?.Email,
        }, admin.Email, c.env).catch(err => console.error('Email error:', err));
      }
    }
  }

  return c.json({ success: true, bookingId });
});

// PATCH /api/bookings/:id/cancel — ยกเลิกการจอง (FR-08)
bookings.patch('/:id/cancel', requireAuth, async (c) => {
  const session = c.get('session');
  const bookingId = c.req.param('id');

  const rows = await executeQuery(
    'SELECT * FROM bookings WHERE BookingID = ? AND UserID = ? LIMIT 1',
    [bookingId, session.user.id],
    c.env
  );

  if (!rows[0]) return c.json({ error: 'ไม่พบการจองนี้' }, 404);
  if (!['pending', 'approved'].includes(rows[0].Status)) {
    return c.json({ error: 'ไม่สามารถยกเลิกได้ในสถานะนี้' }, 400);
  }

  const booking = rows[0];

  await executeQuery(
    "UPDATE bookings SET Status = 'cancelled' WHERE BookingID = ?",
    [bookingId],
    c.env
  );

  // FR-13 / BR-15: ตรวจสอบคิวและแจ้งเตือนคนที่รออยู่
  await checkAndNotifyQueue(booking.RoomID, booking.BookingDate, booking.StartTime, booking.EndTime, c.env);

  return c.json({ success: true });
});

export default bookings;
