import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { hasExistingBookingForDate } from '../utils/bookingRules';
import { notifyAdminNewBooking } from '../utils/mailer';
import { checkAndNotifyQueue } from './queues';
import { executeQuery } from '../config/db';

const bookings = new Hono();

const OPEN_TIME = '08:30';
const CLOSE_TIME = '17:00';

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
    return c.json({ error: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น (FR-01)' }, 400);
  }

  // FR-05: เวลาทำการ 08:30–17:00
  if (start < OPEN_TIME || end > CLOSE_TIME) {
    return c.json({ error: 'จองได้เฉพาะช่วง 08:30–17:00 น. (FR-05)' }, 400);
  }

  // FR-02: จองได้เฉพาะวันปัจจุบัน หรือวันถัดไปถ้าวันนี้เป็นวันหยุด
  const today = new Date().toISOString().split('T')[0];
  const todayHoliday = await executeQuery(
    'SELECT HolidayID FROM holidays WHERE HolidayDate = ? LIMIT 1',
    [today],
    c.env
  );
  
  const isTodayHoliday = todayHoliday.length > 0;
  const allowedDate = isTodayHoliday ? getNextAvailableDay(today, c.env) : today;
  
  if (date !== allowedDate) {
    if (isTodayHoliday) {
      return c.json({ error: `วันนี้เป็นวันหยุด สามารถจองได้เฉพาะวันที่ ${allowedDate} เท่านั้น` }, 400);
    } else {
      return c.json({ error: 'จองได้เฉพาะวันปัจจุบันเท่านั้น (FR-02)' }, 400);
    }
  }

  // FR-05: เลยเวลาปิดแล้ว (ตรวจเฉพาะถ้าจองวันนี้)
  if (!isTodayHoliday) {
    const nowTime = new Date().toTimeString().slice(0, 5);
    if (nowTime >= CLOSE_TIME) {
      return c.json({ error: 'หมดเวลาจองสำหรับวันนี้แล้ว (FR-05)' }, 400);
    }
  }

  // FR-06: เสาร์-อาทิตย์
  const dow = new Date(date + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) {
    return c.json({ error: 'ไม่เปิดให้จองในวันเสาร์-อาทิตย์ (FR-06)' }, 400);
  }

  // FR-12: วันหยุดพิเศษ
  const holidays = await executeQuery(
    'SELECT HolidayID FROM holidays WHERE HolidayDate = ? LIMIT 1',
    [date],
    c.env
  );
  
  if (holidays.length > 0) {
    return c.json({ error: 'วันนี้เป็นวันหยุดพิเศษ ไม่เปิดให้จอง (FR-12)' }, 400);
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
    return c.json({ error: 'ช่วงเวลานี้มีผู้จองอยู่แล้ว กรุณาเลือกเวลาอื่น (FR-03)' }, 400);
  }

  // BR-06 / FR-06: one booking per user per day
  const userBookings = await executeQuery(`
    SELECT BookingDate, Status FROM bookings
    WHERE UserID = ?
      AND BookingDate = ?
      AND Status IN ('pending','approved')
  `, [session.user.id, date], c.env);

  if (hasExistingBookingForDate(userBookings, date)) {
    return c.json({ error: 'คุณมีคำขอจองในวันที่เลือกแล้ว ไม่สามารถจองเพิ่มได้ในวันเดียวกัน (BR-06)' }, 400);
  }

  // สร้างการจอง - ถ้าไม่มี conflict ให้อนุมัติทันที
  const status = 'approved'; // Instant approval when no conflict
  const result = await executeQuery(`
    INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [session.user.id, roomId, date, start, end, status], c.env);

  const bookingId = result.insertId;

  // ถ้าอนุมัติทันที ไม่ต้องแจ้ง Admin
  if (status === 'approved') {
    return c.json({ success: true, bookingId, instantApproval: true });
  }

  // FR-09: แจ้ง Admin (notification ในระบบ) - สำหรับกรณีที่ต้องอนุมัติ
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
