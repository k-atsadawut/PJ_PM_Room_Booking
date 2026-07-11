const express = require('express');
const router = express.Router();
const db = require('../../config/db');

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
};

// GET /api/admin/password-requests - Get all password reset requests
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [requests] = await db.execute(`
      SELECT 
        pr.RequestID,
        pr.UserID,
        pr.Email,
        pr.Status,
        pr.RequestDate,
        pr.ProcessedDate,
        pr.ProcessedBy,
        pr.Notes,
        u.Name as UserName,
        u.Password as UserPassword,
        a.Name as AdminName
      FROM password_reset_requests pr
      LEFT JOIN users u ON pr.UserID = u.UserID
      LEFT JOIN users a ON pr.ProcessedBy = a.UserID
      ORDER BY pr.RequestDate DESC
    `);

    res.json(requests);
  } catch (error) {
    console.error('Get password requests error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

// PATCH /api/admin/password-requests/:id - Approve or reject request
router.patch('/:id', requireAdmin, async (req, res) => {
  const { action, notes } = req.body; // 'approved' | 'rejected'

  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'action ต้องเป็น approved หรือ rejected' });
  }

  try {
    // Get request details
    const [requests] = await db.execute(
      'SELECT * FROM password_reset_requests WHERE RequestID = ? LIMIT 1',
      [req.params.id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'ไม่พบคำขอ' });
    }

    const request = requests[0];

    if (request.Status !== 'pending') {
      return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });
    }

    // Update request
    await db.execute(
      'UPDATE password_reset_requests SET Status = ?, ProcessedDate = NOW(), ProcessedBy = ?, Notes = ? WHERE RequestID = ?',
      [action, req.session.user.id, notes || null, req.params.id]
    );

    // If approved, set force_change_password flag for user
    if (action === 'approved') {
      await db.execute(
        'UPDATE users SET force_change_password = 1 WHERE UserID = ?',
        [request.UserID]
      );

      // Notify user
      await db.execute(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [request.UserID, null, 'คำขอลืมรหัสผ่านได้รับการอนุมัติ กรุณาเข้าสู่ระบบเพื่อเปลี่ยนรหัสผ่าน']
      );
    } else {
      // Notify user if rejected
      await db.execute(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES (?, ?, ?)',
        [request.UserID, null, `คำขอลืมรหัสผ่านถูกปฏิเสธ${notes ? ': ' + notes : ''}`]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update password request error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดต' });
  }
});

module.exports = router;
