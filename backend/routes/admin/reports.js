const express = require('express');
const db = require('../../config/db');
const { requireAdmin } = require('../../middleware/auth');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const router = express.Router();

// GET /api/admin/reports/daily — รายงานรายวัน
router.get('/daily', requireAdmin, async (req, res) => {
  const { date } = req.query;
  const reportDate = date || new Date().toISOString().split('T')[0];

  const [rows] = await db.execute(`
    SELECT 
      b.BookingID,
      b.BookingDate,
      b.StartTime,
      b.EndTime,
      b.Status,
      r.RoomName,
      u.Name AS UserName,
      u.Faculty,
      u.Department
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    JOIN users u ON b.UserID = u.UserID
    WHERE b.BookingDate = ?
    ORDER BY b.StartTime ASC
  `, [reportDate]);

  res.json({ date: reportDate, bookings: rows });
});

// GET /api/admin/reports/monthly — รายงานรายเดือน
router.get('/monthly', requireAdmin, async (req, res) => {
  const { year, month } = req.query;
  const reportYear = year || new Date().getFullYear();
  const reportMonth = month || String(new Date().getMonth() + 1).padStart(2, '0');

  const [rows] = await db.execute(`
    SELECT 
      b.BookingDate,
      b.StartTime,
      b.EndTime,
      b.Status,
      r.RoomName,
      u.Name AS UserName,
      u.Faculty
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    JOIN users u ON b.UserID = u.UserID
    WHERE YEAR(b.BookingDate) = ? AND MONTH(b.BookingDate) = ?
    ORDER BY b.BookingDate ASC, b.StartTime ASC
  `, [reportYear, reportMonth]);

  res.json({ year: reportYear, month: reportMonth, bookings: rows });
});

// GET /api/admin/reports/frequent-users — ผู้ใช้ที่จองบ่อยที่สุด
router.get('/frequent-users', requireAdmin, async (req, res) => {
  const { limit = 10 } = req.query;

  const [rows] = await db.execute(`
    SELECT 
      u.UserID,
      u.Name,
      u.Email,
      u.Faculty,
      COUNT(b.BookingID) AS BookingCount
    FROM users u
    JOIN bookings b ON u.UserID = b.UserID
    WHERE b.Status IN ('approved', 'completed')
    GROUP BY u.UserID
    ORDER BY BookingCount DESC
    LIMIT ?
  `, [limit]);

  res.json(rows);
});

// GET /api/admin/reports/popular-rooms — ห้องที่ใช้มากที่สุด
router.get('/popular-rooms', requireAdmin, async (req, res) => {
  const { startDate, endDate } = req.query;
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];

  const [rows] = await db.execute(`
    SELECT 
      r.RoomID,
      r.RoomName,
      COUNT(b.BookingID) AS BookingCount,
      SUM(
        TIMESTAMPDIFF(MINUTE, b.StartTime, b.EndTime)
      ) AS TotalMinutes
    FROM rooms r
    LEFT JOIN bookings b ON r.RoomID = b.RoomID
      AND b.BookingDate BETWEEN ? AND ?
      AND b.Status IN ('approved', 'completed')
    GROUP BY r.RoomID
    ORDER BY BookingCount DESC
  `, [start, end]);

  res.json({ startDate: start, endDate: end, rooms: rows });
});

// GET /api/admin/reports/export/excel — Export Excel
router.get('/export/excel', requireAdmin, async (req, res) => {
  const { type, startDate, endDate } = req.query;
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bookings');

  // Headers
  worksheet.columns = [
    { header: 'Booking ID', key: 'id', width: 15 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Start Time', key: 'start', width: 12 },
    { header: 'End Time', key: 'end', width: 12 },
    { header: 'Room', key: 'room', width: 20 },
    { header: 'User', key: 'user', width: 25 },
    { header: 'Faculty', key: 'faculty', width: 20 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  // Data
  const [rows] = await db.execute(`
    SELECT 
      b.BookingID,
      b.BookingDate,
      b.StartTime,
      b.EndTime,
      r.RoomName,
      u.Name,
      u.Faculty,
      b.Status
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    JOIN users u ON b.UserID = u.UserID
    WHERE b.BookingDate BETWEEN ? AND ?
    ORDER BY b.BookingDate ASC, b.StartTime ASC
  `, [start, end]);

  rows.forEach(row => {
    worksheet.addRow({
      id: row.BookingID,
      date: row.BookingDate,
      start: row.StartTime,
      end: row.EndTime,
      room: row.RoomName,
      user: row.Name,
      faculty: row.Faculty || '-',
      status: row.Status,
    });
  });

  // Style header
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=bookings_${start}_to_${end}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/admin/reports/export/pdf — Export PDF
router.get('/export/pdf', requireAdmin, async (req, res) => {
  const { startDate, endDate } = req.query;
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];

  const [rows] = await db.execute(`
    SELECT 
      b.BookingDate,
      b.StartTime,
      b.EndTime,
      r.RoomName,
      u.Name,
      u.Faculty,
      b.Status
    FROM bookings b
    JOIN rooms r ON b.RoomID = r.RoomID
    JOIN users u ON b.UserID = u.UserID
    WHERE b.BookingDate BETWEEN ? AND ?
    ORDER BY b.BookingDate ASC, b.StartTime ASC
  `, [start, end]);

  const doc = new PDFDocument({ margin: 50 });
  const filename = `bookings_${start}_to_${end}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  doc.pipe(res);

  // Title
  doc.fontSize(20).font('Helvetica-Bold').text('รายงานการจองห้อง', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).font('Helvetica').text(`วันที่: ${start} ถึง ${end}`, { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  // Table header
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('วันที่', 50, doc.y);
  doc.text('เวลา', 120, doc.y);
  doc.text('ห้อง', 180, doc.y);
  doc.text('ผู้จอง', 280, doc.y);
  doc.text('สถานะ', 450, doc.y);
  doc.moveDown();

  // Table data
  doc.fontSize(9).font('Helvetica');
  rows.forEach(row => {
    const y = doc.y;
    doc.text(row.BookingDate, 50, y);
    doc.text(`${row.StartTime}-${row.EndTime}`, 120, y);
    doc.text(row.RoomName, 180, y);
    doc.text(row.Name, 280, y);
    doc.text(row.Status, 450, y);
    doc.moveDown();
  });

  doc.end();
});

module.exports = router;
