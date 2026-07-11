const express = require('express');
const router = express.Router();
const db = require('../config/db');

// POST /api/forgot-password - User requests password reset
router.post('/', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'กรุณาระบุอีเมล' });
  }

  try {
    // Find user by email
    const [users] = await db.execute(
      'SELECT UserID, Name FROM users WHERE Email = ? LIMIT 1',
      [email]
    );

    if (users.length === 0) {
      // Don't reveal if email exists for security
      return res.json({ success: true, message: 'หากอีเมลมีในระบบ แจ้งเตือนจะถูกส่งไปยัง admin' });
    }

    const user = users[0];

    // Check if there's already a pending request
    const [existing] = await db.execute(
      'SELECT RequestID FROM password_reset_requests WHERE UserID = ? AND Status = "pending" LIMIT 1',
      [user.UserID]
    );

    if (existing.length > 0) {
      return res.json({ success: true, message: 'คำขอลืมรหัสผ่านของคุณอยู่ระหว่างดำเนินการ' });
    }

    // Create password reset request
    const [result] = await db.execute(
      'INSERT INTO password_reset_requests (UserID, Email, Status) VALUES (?, ?, "pending")',
      [user.UserID, email]
    );

    const requestId = result.insertId;

    // Notify admins
    const [admins] = await db.execute("SELECT UserID FROM users WHERE Role = 'admin'");
    if (admins.length > 0) {
      const notifValues = admins.map(a => [
        a.UserID,
        null,
        `คำขอลืมรหัสผ่านจาก ${user.Name} (${email}) - รอการอนุมัติ`,
      ]);
      await db.query(
        'INSERT INTO notifications (UserID, BookingID, Message) VALUES ?',
        [notifValues]
      );
    }

    res.json({ success: true, message: 'ส่งคำขอลืมรหัสผ่านเรียบร้อย กรุณารอ admin อนุมัติ' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งคำขอ' });
  }
});

module.exports = router;
