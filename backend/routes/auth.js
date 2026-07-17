const express = require('express');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');
const { evaluateLoginAttempt, DEFAULT_MAX_ATTEMPTS, DEFAULT_LOCK_MINUTES } = require('../utils/authLock');
const router  = express.Router();

const MAX_ATTEMPTS  = Number(process.env.MAX_LOGIN_ATTEMPTS)  || DEFAULT_MAX_ATTEMPTS;
const LOCK_MINUTES  = Number(process.env.LOGIN_LOCK_MINUTES)  || DEFAULT_LOCK_MINUTES;

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

  const passwordValid = await verifyPassword(password, user.Password);

  // FR-19: ใช้ pure function evaluateLoginAttempt เพื่อคำนวณ action
  // (ล็อกตรวจก่อนตรวจรหัสผ่าน → ป้องกัน login ด้วยรหัสถูกขณะบัญชีล็อกอยู่)
  const result = evaluateLoginAttempt({
    user,
    passwordValid,
    now: new Date(),
    maxAttempts: MAX_ATTEMPTS,
    lockMinutes: LOCK_MINUTES,
  });

  // ── เขียน DB state ตามผล (มี race guard: WHERE เพิ่มเงื่อนไข count เดิม) ──
  if (result.action === 'allow' && result.shouldResetCount) {
    await db.execute(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
      [user.UserID]
    );
  } else if (result.action === 'lock' && result.lockedUntil && !result.shouldResetCount) {
    // บัญชีล็อกอยู่ก่อนแล้ว — ไม่ต้องแก้ DB
  } else if (result.action === 'lock') {
    // ถึงเกณฑ์ล็อกใหม่ — reset count=0 และตั้ง locked_until
    await db.execute(
      'UPDATE users SET failed_login_count = 0, locked_until = ? WHERE UserID = ?',
      [result.lockedUntil, user.UserID]
    );
  } else if (result.action === 'reject') {
    // รหัสผิดยังไม่ถึงเกณฑ์ — นับสะสม
    // Race guard: อัปเดตเฉพาะเมื่อ count ยังเป็นค่าเดิม (กัน lost-update จาก request ซ้อน)
    const expectedCount = Number(user.failed_login_count) || 0;
    await db.execute(
      'UPDATE users SET failed_login_count = ? WHERE UserID = ? AND failed_login_count = ?',
      [result.attempts, user.UserID, expectedCount]
    );
  }

  // ── ส่ง response ตาม action ─────────────────────────────────────
  if (result.action === 'lock') {
    return res.status(403).json({ error: result.errorMessage, isLocked: true });
  }
  if (result.action === 'reject') {
    return res.status(401).json({ error: result.errorMessage });
  }

  // action === 'allow'
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
