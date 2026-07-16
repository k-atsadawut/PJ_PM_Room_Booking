const express = require('express');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');
const router  = express.Router();

const MAX_ATTEMPTS  = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 10;
const LOCK_MINUTES  = parseInt(process.env.LOGIN_LOCK_MINUTES)  || 360;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
  }



  const [rows] = await db.execute(
    'SELECT * FROM users WHERE Email = ? LIMIT 1', [email]
  );
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }

  // ตรวจสอบบัญชีถูกล็อก (FR-14)
  if (user.locked_until && new Date() < new Date(user.locked_until)) {
    const unlockTime = new Date(user.locked_until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return res.status(403).json({ error: `บัญชีถูกล็อก กรุณารอจนถึง ${unlockTime} น.` });
  }

  const valid = await verifyPassword(password, user.Password);

  if (!valid) {
    const attempts = (user.failed_login_count || 0) + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
      : null;

    await db.execute(
      'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE UserID = ?',
      [attempts >= MAX_ATTEMPTS ? 0 : attempts, lockedUntil, user.UserID]
    );

    if (attempts >= MAX_ATTEMPTS) {
      return res.status(403).json({ error: `กรอกรหัสผ่านผิด ${MAX_ATTEMPTS} ครั้ง บัญชีถูกล็อก ${LOCK_MINUTES / 60} ชั่วโมง` });
    }

    return res.status(401).json({ error: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (${attempts}/${MAX_ATTEMPTS})` });
  }

  // รีเซ็ต failed count
  await db.execute(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
    [user.UserID]
  );

  req.session.user = {
    id:   user.UserID,
    name: user.Name,
    email: user.Email,
    role: user.Role,
    forceChangePassword: user.force_change_password === 1,
  };

  res.json({
    success: true,
    user: req.session.user,
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// POST /api/auth/change-password (FR-18, FR-19)
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวไม่น้อยกว่า 6 ตัวอักษร (FR-19)' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน (FR-19)' });
  }

  const [rows] = await db.execute(
    'SELECT Password, force_change_password FROM users WHERE UserID = ?',
    [req.session.user.id]
  );
  const user = rows[0];

  // ถ้าไม่ใช่ force change ให้ตรวจรหัสเดิมด้วย
  if (!user.force_change_password) {
    const valid = await verifyPassword(currentPassword, user.Password);
    if (!valid) {
      return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
  }

  const hashedPassword = await hashPassword(newPassword);

  await db.execute(
    'UPDATE users SET Password = ?, force_change_password = 0 WHERE UserID = ?',
    [hashedPassword, req.session.user.id]
  );

  req.session.user.forceChangePassword = false;
  res.json({ success: true });
});

module.exports = router;
