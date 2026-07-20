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

  const result = await executeQuery(query, params, c.env);
  
  return c.json(result);
});

// Note: Auto-approval system is enabled in src/routes/bookings.js
// Manual approval/rejection routes are disabled since bookings are automatically approved

export default adminBookings;
