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

  const result = await executeQuery(query, params, c.env);
  
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

  const result = await executeQuery(query, params, c.env);

  return c.json(result);
});

// GET /api/admin/reports/users — รายงานผู้ใช้ที่จองบ่อยที่สุด (FR-21) with duration calculation
adminReports.get('/users', requireAdmin, async (c) => {
  const { startDate, endDate, limit } = c.req.query();

  let query = `
    SELECT
      u.UserID,
      u.Name,
      u.Email,
      u.Role,
      u.Faculty,
      u.Department,
      COUNT(b.BookingID) AS total_bookings,
      SUM(CASE WHEN b.Status = 'approved' THEN 1 ELSE 0 END) AS approved_bookings,
      SUM(CASE WHEN b.Status = 'pending' THEN 1 ELSE 0 END) AS pending_bookings,
      SUM(CASE WHEN b.Status = 'rejected' THEN 1 ELSE 0 END) AS rejected_bookings,
      SUM(CASE WHEN b.Status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_bookings,
      SUM(CASE WHEN b.Status = 'approved' 
        THEN TIMESTAMPDIFF(MINUTE, CONCAT(b.BookingDate, ' ', b.StartTime), CONCAT(b.BookingDate, ' ', b.EndTime)) / 60 
        ELSE 0 
      END) AS total_hours
    FROM users u
    LEFT JOIN bookings b ON u.UserID = b.UserID
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

  query += ' GROUP BY u.UserID ORDER BY total_bookings DESC, approved_bookings DESC';
  if (limit) {
    const n = Math.max(1, Math.min(1000, parseInt(limit, 10) || 10));
    query += ' LIMIT ' + n;
  } else {
    query += ' LIMIT 10';
  }

  const result = await executeQuery(query, params, c.env);

  return c.json(result);
});

// GET /api/admin/reports/summary — รายงานสรุปการใช้งานแบบครบถ้วน (สถานะ, ห้อง, ผู้ใช้, กรองตามวันที่)
adminReports.get('/summary', requireAdmin, async (c) => {
  const { startDate, endDate, filterType } = c.req.query();

  // 1. สรุปจำนวนการจองแยกตามสถานะ
  let statusQuery = `
    SELECT 
      COUNT(*) as total_bookings,
      SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN Status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN Status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM bookings
  `;

  // 2. สถิติการใช้งานแยกตามห้อง
  let roomQuery = `
    SELECT
      r.RoomName,
      r.Capacity,
      COUNT(b.BookingID) as total_bookings,
      SUM(CASE WHEN b.Status = 'approved' THEN 1 ELSE 0 END) as approved_bookings,
      SUM(CASE WHEN b.Status = 'approved' 
        THEN TIMESTAMPDIFF(MINUTE, CONCAT(b.BookingDate, ' ', b.StartTime), CONCAT(b.BookingDate, ' ', b.EndTime)) / 60 
        ELSE 0 
      END) AS total_hours
    FROM rooms r
    LEFT JOIN bookings b ON r.RoomID = b.RoomID
  `;

  // 3. รายชื่อผู้ใช้ที่จองบ่อยที่สุดพร้อมจำนวนครั้งและระยะเวลา
  let userQuery = `
    SELECT
      u.UserID,
      u.Name,
      u.Email,
      u.Role,
      u.Faculty,
      u.Department,
      COUNT(b.BookingID) AS total_bookings,
      SUM(CASE WHEN b.Status = 'approved' THEN 1 ELSE 0 END) AS approved_bookings,
      SUM(CASE WHEN b.Status = 'pending' THEN 1 ELSE 0 END) AS pending_bookings,
      SUM(CASE WHEN b.Status = 'rejected' THEN 1 ELSE 0 END) AS rejected_bookings,
      SUM(CASE WHEN b.Status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_bookings,
      SUM(CASE WHEN b.Status = 'approved' 
        THEN TIMESTAMPDIFF(MINUTE, CONCAT(b.BookingDate, ' ', b.StartTime), CONCAT(b.BookingDate, ' ', b.EndTime)) / 60 
        ELSE 0 
      END) AS total_hours
    FROM users u
    LEFT JOIN bookings b ON u.UserID = b.UserID
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

  const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  // Apply filters to all queries
  statusQuery += whereClause;
  roomQuery += whereClause + ' GROUP BY r.RoomID ORDER BY total_bookings DESC';
  userQuery += whereClause + ' GROUP BY u.UserID ORDER BY total_bookings DESC, approved_bookings DESC LIMIT 10';

  const [statusResult, roomResult, userResult] = await Promise.all([
    executeQuery(statusQuery, params, c.env),
    executeQuery(roomQuery, params, c.env),
    executeQuery(userQuery, params, c.env)
  ]);

  return c.json({
    statusBreakdown: statusResult[0],
    roomStatistics: roomResult,
    topUsers: userResult,
    filter: {
      startDate,
      endDate,
      filterType: filterType || 'custom'
    }
  });
});

export default adminReports;
