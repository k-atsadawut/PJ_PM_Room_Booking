import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { executeQuery } from '../../config/db';

const adminReports = new Hono();

// GET /api/admin/reports/bookings — รายงานสรุปการจอง
adminReports.get('/bookings', requireAdmin, async (c) => {
  const { startDate, endDate } = c.req.query();

  let query = `
    SELECT 
      COUNT(*) as total_bookings,
      SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN Status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN Status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM bookings
  `;

  const params = [];
  const conditions = [];

  if (startDate) {
    conditions.push('BookingDate >= ?');
    params.push(startDate);
  }
  
  if (endDate) {
    conditions.push('BookingDate <= ?');
    params.push(endDate);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const result = await executeQuery(query, params);
  
  return c.json(result[0]);
});

// GET /api/admin/reports/rooms — รายงานการใช้งานห้อง
adminReports.get('/rooms', requireAdmin, async (c) => {
  const { startDate, endDate } = c.req.query();

  let query = `
    SELECT 
      r.RoomName,
      r.Capacity,
      COUNT(b.BookingID) as total_bookings,
      SUM(CASE WHEN b.Status = 'approved' THEN 1 ELSE 0 END) as approved_bookings
    FROM rooms r
    LEFT JOIN bookings b ON r.RoomID = b.RoomID
  `;

  const params = [];
  const conditions = [];

  if (startDate) {
    conditions.push('b.BookingDate >= ?');
    params.push(startDate);
  }
  
  if (endDate) {
    conditions.push('b.BookingDate <= ?');
    params.push(endDate);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY r.RoomID ORDER BY total_bookings DESC';

  const result = await executeQuery(query, params);
  
  return c.json(result);
});

export default adminReports;
