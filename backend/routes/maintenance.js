const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');
const router = express.Router();

// POST /api/maintenance — แจ้งซ่อม (FR-15)
router.post('/', requireAuth, async (req, res) => {
  const { roomId, description, urgency } = req.body;

  if (!roomId || !description) {
    return res.status(400).json({ error: 'กรุณาระบุห้องและรายละเอียดปัญหา' });
  }

  try {
    const [result] = await db.execute(`
      INSERT INTO maintenance_reports (UserID, RoomID, Description, Urgency, Status, ReportDate)
      VALUES (?, ?, ?, ?, 'pending', NOW())
    `, [req.session.user.id, roomId, description, urgency || 'normal']);

    // แจ้ง Admin
    const [admins] = await db.execute("SELECT Email FROM users WHERE Role = 'admin'");
    const [room] = await db.execute("SELECT RoomName FROM rooms WHERE RoomID = ?", [roomId]);
    const roomName = room[0]?.RoomName || roomId;

    if (admins.length > 0) {
      const subject = `แจ้งซ่อมห้อง ${roomName}`;
      const text = `
มีรายงานการแจ้งซ่อมใหม่:

ห้อง: ${roomName}
ผู้แจ้ง: ${req.session.user.name}
รายละเอียด: ${description}
ความเร่งด่วน: ${urgency || 'ปกติ'}

กรุณาเข้าสู่ระบบเพื่อตรวจสอบ
      `.trim();

      admins.forEach(admin => {
        if (admin.Email) {
          sendEmail({ to: admin.Email, subject, text }).catch(err => console.error('Email error:', err));
        }
      });
    }

    res.json({ success: true, reportId: result.insertId });
  } catch (error) {
    console.error('Maintenance report error:', error);
    res.status(500).json({ error: 'บันทึกรายงานไม่สำเร็จ' });
  }
});

// GET /api/maintenance — ดูรายงานที่ตัวเองแจ้ง
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT mr.*, r.RoomName
    FROM maintenance_reports mr
    JOIN rooms r ON mr.RoomID = r.RoomID
    WHERE mr.UserID = ?
    ORDER BY mr.ReportDate DESC
  `, [req.session.user.id]);

  res.json(rows);
});

// GET /api/maintenance/admin — ดูรายงานทั้งหมด (Admin only)
router.get('/admin', requireAdmin, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT mr.*, r.RoomName, u.Name AS ReporterName
    FROM maintenance_reports mr
    JOIN rooms r ON mr.RoomID = r.RoomID
    JOIN users u ON mr.UserID = u.UserID
    ORDER BY mr.ReportDate DESC
  `);

  res.json(rows);
});

// PATCH /api/maintenance/:id — อัปเดตสถานะ (Admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { status, notes } = req.body;

  if (!['pending', 'in_progress', 'completed', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }

  await db.execute(
    'UPDATE maintenance_reports SET Status = ?, Notes = ?, UpdatedDate = NOW() WHERE ReportID = ?',
    [status, notes || null, req.params.id]
  );

  // แจ้งผู้แจ้ง
  const [report] = await db.execute(`
    SELECT mr.*, u.Email, r.RoomName
    FROM maintenance_reports mr
    JOIN users u ON mr.UserID = u.UserID
    JOIN rooms r ON mr.RoomID = r.RoomID
    WHERE mr.ReportID = ?
  `, [req.params.id]);

  if (report[0] && report[0].Email) {
    const subject = `อัปเดตสถานะการแจ้งซ่อม - ${report[0].RoomName}`;
    const statusText = {
      pending: 'รอดำเนินการ',
      in_progress: 'กำลังดำเนินการ',
      completed: 'เสร็จสิ้น',
      rejected: 'ถูกปฏิเสธ'
    };
    const text = `
รายงานการแจ้งซ่อมของคุณได้รับการอัปเดต:

ห้อง: ${report[0].RoomName}
สถานะ: ${statusText[status]}
หมายเหตุ: ${notes || '-'}

${status === 'completed' ? 'ขอบคุณที่แจ้งปัญหา' : ''}
    `.trim();

    sendEmail({ to: report[0].Email, subject, text }).catch(err => console.error('Email error:', err));
  }

  res.json({ success: true });
});

module.exports = router;
