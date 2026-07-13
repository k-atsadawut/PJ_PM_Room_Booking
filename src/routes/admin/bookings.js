import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { executeQuery } from '../../config/db';

const adminBookings = new Hono();

// GET /api/admin/bookings — ดูการจองทั้งหมด
adminBookings.get('/', requireAdmin, async (c) => {
  const { status, date } = c.req.query();

  let query = `
    SELECT b.*, u.Name AS UserName, u.Email AS UserEmail, r.RoomName
    FROM bookings b
    JOIN users u ON b.UserID = u.UserID
    JOIN rooms r ON b.RoomID = r.RoomID
  `;
  
  const params = [];
  const conditions = [];

  if (status) {
    conditions.push('b.Status = ?');
    params.push(status);
  }
  
  if (date) {
    conditions.push('b.BookingDate = ?');
    params.push(date);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY b.BookingDate DESC, b.StartTime DESC';

  const result = await executeQuery(query, params);
  
  return c.json(result);
});

// PATCH /api/admin/bookings/:id/approve — อนุมัติการจอง
adminBookings.patch('/:id/approve', requireAdmin, async (c) => {
  const bookingId = c.req.param('id');

  await executeQuery(
    "UPDATE bookings SET Status = 'approved' WHERE BookingID = ?",
    [bookingId]
  );

  // Send notification to user
  const booking = await executeQuery(`
    SELECT b.UserID, b.BookingDate, b.StartTime, b.EndTime, r.RoomName
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    WHERE b.BookingID = ?
  `, [bookingId]);

  if (booking.length > 0) {
    const b = booking[0];
    await executeQuery(
      'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
      [
        b.UserID,
        bookingId,
        `การจองห้อง ${b.RoomName} วันที่ ${b.BookingDate} เวลา ${b.StartTime}-${b.EndTime} ได้รับการอนุมัติแล้ว`
      ]
    );
  }

  return c.json({ success: true });
});

// PATCH /api/admin/bookings/:id/reject — ปฏิเสธการจอง
adminBookings.patch('/:id/reject', requireAdmin, async (c) => {
  const bookingId = c.req.param('id');

  await executeQuery(
    "UPDATE bookings SET Status = 'rejected' WHERE BookingID = ?",
    [bookingId]
  );

  // Send notification to user
  const booking = await executeQuery(`
    SELECT b.UserID, b.BookingDate, b.StartTime, b.EndTime, r.RoomName
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    WHERE b.BookingID = ?
  `, [bookingId]);

  if (booking.length > 0) {
    const b = booking[0];
    await executeQuery(
      'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
      [
        b.UserID,
        bookingId,
        `การจองห้อง ${b.RoomName} วันที่ ${b.BookingDate} เวลา ${b.StartTime}-${b.EndTime} ถูกปฏิเสธ`
      ]
    );
  }

  return c.json({ success: true });
});

export default adminBookings;
