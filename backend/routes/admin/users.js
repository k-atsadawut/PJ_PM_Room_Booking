const express = require('express');
const db      = require('../../config/db');
const { requireAdmin } = require('../../middleware/auth');
const { hashPassword } = require('../../utils/password');
const router  = express.Router();

// GET /api/admin/users
router.get('/', requireAdmin, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT UserID, Name, Email, Role, Faculty, Department, force_change_password, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(rows);
});

// POST /api/admin/users — สร้างผู้ใช้ (FR-17: Admin สร้างเท่านั้น)
router.post('/', requireAdmin, async (req, res) => {
  const { name, email, role, faculty, department } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'กรุณากรอก ชื่อ, อีเมล และสิทธิ์' });
  }

  // รหัสผ่านเริ่มต้น = ชื่อ-นามสกุลเต็ม (BR-11/FR-18 ตาม SRS_v3) พร้อม force_change_password = 1
  const fullName = name.trim();
  const hashed   = await hashPassword(fullName);

  await db.execute(
    `INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [name, email, hashed, role, faculty || null, department || null]
  );

  res.json({ success: true });
});

// PATCH /api/admin/users/:id — แก้ไข
router.patch('/:id', requireAdmin, async (req, res) => {
  const { name, email, role, faculty, department } = req.body;
  await db.execute(
    'UPDATE users SET Name=?, Email=?, Role=?, Faculty=?, Department=? WHERE UserID=?',
    [name, email, role, faculty || null, department || null, req.params.id]
  );
  res.json({ success: true });
});

// DELETE /api/admin/users/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id == req.session.user.id) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
  }
  await db.execute('DELETE FROM users WHERE UserID = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
