import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { hasExistingBookingForDate } from '../utils/bookingRules';
import { notifyAdminNewBooking, notifyUserBookingConfirmed } from '../utils/mailer';
import { checkAndNotifyQueue } from './queues';
import { executeQuery } from '../config/db';

const bookings = new Hono();

const OPEN_TIME = '08:30';
const CLOSE_TIME = '17:00';
const MAX_BOOKING_HOURS_DEFAULT = 3; // FR-23 (SRS v3.0)

// Helper function to get current date in Thailand timezone (Asia/Bangkok, UTC+7)
function getThailandDate() {
  const now = new Date();
  const thailandOffset = 7 * 60; // UTC+7 in minutes
  const localOffset = now.getTimezoneOffset(); // Local timezone offset in minutes
  const thailandTime = new Date(now.getTime() + (thailandOffset + localOffset) * 60000);
  return thailandTime.toISOString().split('T')[0];
}

// Helper function to get current time in Thailand timezone
function getThailandTime() {
  const now = new Date();
  const thailandOffset = 7 * 60; // UTC+7 in minutes
  const localOffset = now.getTimezoneOffset(); // Local timezone offset in minutes
  const thailandTime = new Date(now.getTime() + (thailandOffset + localOffset) * 60000);
  return thailandTime.toTimeString().slice(0, 5);
}

// คำนวณชั่วโมงระหว่าง "HH:MM" สองค่า (end - start)
function diffHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

// Validation functions
function validateBookingInput({ roomId, date, start, end }) {
  if (!roomId || !date || !start || !end) {
    return { valid: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
  }
  if (start >= end) {
    return { valid: false, error: 'เวลาสิ้นสุดการจองต้องอยู่หลังเวลาเริ่มต้น' };
  }
  return { valid: true };
}

function validateBookingTime(start, end, maxHours) {
  const durationHours = diffHours(start, end);
  if (durationHours > maxHours) {
    return { valid: false, error: `ระบบจำกัดการจองสูงสุด ${maxHours} ชั่วโมงต่อครั้ง กรุณาลดระยะเวลาการจอง` };
  }
  if (start < OPEN_TIME || end > CLOSE_TIME) {
    return { valid: false, error: 'สามารถจองห้องได้เฉพาะในช่วงเวลาทำการ 08:30 น. ถึง 17:00 น. เท่านั้น' };
  }
  return { valid: true };
}

function validateBookingDate(date, today) {
  if (date < today) {
    return { valid: false, error: 'ไม่สามารถจองห้องย้อนหลังได้ กรุณาเลือกวันที่ปัจจุบันหรือวันข้างหน้า' };
  }
  return { valid: true };
}

function validateWeekend(date) {
  const dow = new Date(date + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) {
    return { valid: false, error: 'ระบบไม่เปิดให้จองห้องในวันเสาร์และวันอาทิตย์' };
  }
  return { valid: true };
}

async function validateHoliday(date, env) {
  const holidays = await executeQuery(
    'SELECT HolidayID FROM holidays WHERE HolidayDate = ? LIMIT 1',
    [date],
    env
  );
  if (holidays.length > 0) {
    return { valid: false, error: 'วันที่เลือกเป็นวันหยุดพิเศษของมหาวิทยาลัย จึงไม่เปิดให้บริการจองห้อง' };
  }
  return { valid: true };
}

async function validateBookingConflict(roomId, date, start, end, env) {
  const conflicts = await executeQuery(`
    SELECT BookingID FROM bookings
    WHERE RoomID = ?
      AND BookingDate = ?
      AND Status = 'approved'
      AND StartTime < ? AND EndTime > ?
    LIMIT 1
  `, [roomId, date, end, start], env);
  if (conflicts.length > 0) {
    return { valid: false, error: 'ช่วงเวลานี้มีผู้จองไว้แล้ว กรุณาเลือกช่วงเวลาอื่นที่ว่าง' };
  }
  return { valid: true };
}

async function validateDuplicateRoomBooking(userId, roomId, date, env) {
  const duplicate = await executeQuery(`
    SELECT BookingID FROM bookings
    WHERE UserID = ?
      AND RoomID = ?
      AND BookingDate = ?
      AND Status = 'approved'
    LIMIT 1
  `, [userId, roomId, date], env);
  if (duplicate.length > 0) {
    return { valid: false, error: 'คุณมีการจองห้องนี้ในวันนี้แล้ว ไม่สามารถจองห้องเดิมซ้ำได้' };
  }
  return { valid: true };
}

async function validateDailyBookingLimit(userId, date, env) {
  const userBookings = await executeQuery(`
    SELECT BookingDate, Status FROM bookings
    WHERE UserID = ?
      AND BookingDate = ?
      AND Status = 'approved'
  `, [userId, date], env);
  if (hasExistingBookingForDate(userBookings, date)) {
    return { valid: false, error: 'คุณมีการจองหรือคำขอจองในวันนี้แล้ว ระบบจำกัดให้จองได้เพียง 1 ครั้งต่อวันเท่านั้น' };
  }
  return { valid: true };
}

function sendNotificationsAsync(bookingData, bookingId, env) {
  // Send email to user
  notifyUserBookingConfirmed(bookingData, bookingData.UserEmail, env).catch(err => {
    console.error('Failed to send user email:', err);
  });

  // Send email to admin
  if (env.ADMIN_EMAIL) {
    notifyAdminNewBooking(bookingData, env.ADMIN_EMAIL, env).catch(err => {
      console.error('Failed to send admin email:', err);
    });
  }

  // Send in-app notification to all admin users
  executeQuery(
    "SELECT UserID FROM users WHERE Role = 'admin'",
    [],
    env
  ).then(adminUsers => {
    const notificationPromises = adminUsers.map(admin =>
      executeQuery(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [
          admin.UserID,
          bookingId,
          `มีการจองห้อง ${bookingData.RoomName} วันที่ ${bookingData.BookingDate} เวลา ${bookingData.StartTime}-${bookingData.EndTime} โดย ${bookingData.UserName}`
        ],
        env
      )
    );
    return Promise.all(notificationPromises);
  }).catch(err => {
    console.error('Failed to send notifications:', err);
  });
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

  // Input validation
  const inputValidation = validateBookingInput({ roomId, date, start, end });
  if (!inputValidation.valid) {
    return c.json({ error: inputValidation.error }, 400);
  }

  // Time validation
  const MAX_BOOKING_HOURS = Number(c.env?.MAX_BOOKING_HOURS) || 3;
  const timeValidation = validateBookingTime(start, end, MAX_BOOKING_HOURS);
  if (!timeValidation.valid) {
    return c.json({ error: timeValidation.error }, 400);
  }

  // Date validation
  const today = getThailandDate();
  const dateValidation = validateBookingDate(date, today);
  if (!dateValidation.valid) {
    return c.json({ error: dateValidation.error }, 400);
  }

  // Check if user exists
  const userExists = await executeQuery(
    'SELECT UserID FROM users WHERE UserID = ? LIMIT 1',
    [session.user.id],
    c.env
  );
  if (userExists.length === 0) {
    return c.json({ error: 'ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินใหม่' }, 401);
  }

  // Check if past closing time for today's booking
  if (date === today) {
    const nowTime = getThailandTime();
    if (nowTime >= CLOSE_TIME) {
      return c.json({ error: 'เลยเวลาทำการสำหรับการจองห้องในวันนี้แล้ว (หลัง 17:00 น.) โปรดเลือกจองล่วงหน้าในวันอื่นแทน' }, 400);
    }
  }

  // Weekend validation
  const weekendValidation = validateWeekend(date);
  if (!weekendValidation.valid) {
    return c.json({ error: weekendValidation.error }, 400);
  }

  // Holiday validation
  const holidayValidation = await validateHoliday(date, c.env);
  if (!holidayValidation.valid) {
    return c.json({ error: holidayValidation.error }, 400);
  }

  // Conflict validation
  const conflictValidation = await validateBookingConflict(roomId, date, start, end, c.env);
  if (!conflictValidation.valid) {
    return c.json({ error: conflictValidation.error }, 400);
  }

  // Duplicate room booking validation
  const duplicateValidation = await validateDuplicateRoomBooking(session.user.id, roomId, date, c.env);
  if (!duplicateValidation.valid) {
    return c.json({ error: duplicateValidation.error }, 400);
  }

  // Daily booking limit validation
  const dailyLimitValidation = await validateDailyBookingLimit(session.user.id, date, c.env);
  if (!dailyLimitValidation.valid) {
    return c.json({ error: dailyLimitValidation.error }, 400);
  }

  // Create booking
  const result = await executeQuery(
    'INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status) VALUES (?, ?, ?, ?, ?, ?)',
    [session.user.id, roomId, date, start, end, 'approved'],
    c.env
  );

  const bookingId = result.insertId || result.lastInsertId;

  // Get booking details for notifications
  const bookingDetails = await executeQuery(
    'SELECT b.*, r.RoomName, u.Name as UserName, u.Email as UserEmail FROM bookings b JOIN rooms r ON b.RoomID = r.RoomID JOIN users u ON b.UserID = u.UserID WHERE b.BookingID = ?',
    [bookingId],
    c.env
  );

  if (bookingDetails.length > 0) {
    sendNotificationsAsync(bookingDetails[0], bookingId, c.env);
  }

  return c.json({ success: true, bookingId, status: 'approved' });
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
  if (!['approved'].includes(rows[0].Status)) {
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
