import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { createSession, destroySession, getSession } from '../middleware/session';
import { hashPassword, verifyPassword } from '../utils/password';
import { executeQuery } from '../config/db';

const auth = new Hono();

const MAX_ATTEMPTS = 10;
const LOCK_MINUTES = 360;

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  if (!email || !password) {
    return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400);
  }

  const users = await executeQuery(
    'SELECT * FROM users WHERE Email = ? LIMIT 1',
    [email],
    c.env
  );
  
  const user = users[0];

  if (!user) {
    return c.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }

  // Check if account is locked
  if (user.locked_until && new Date() < new Date(user.locked_until)) {
    const unlockTime = new Date(user.locked_until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return c.json({ error: `บัญชีถูกล็อก กรุณารอจนถึง ${unlockTime} น.` }, 403);
  }

  const valid = await verifyPassword(password, user.Password);

  if (!valid) {
    const attempts = (user.failed_login_count || 0) + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null;

    await executeQuery(
      'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE UserID = ?',
      [attempts >= MAX_ATTEMPTS ? 0 : attempts, lockedUntil, user.UserID],
      c.env
    );

    if (attempts >= MAX_ATTEMPTS) {
      return c.json({ error: `กรอกรหัสผ่านผิด ${MAX_ATTEMPTS} ครั้ง บัญชีถูกล็อก ${LOCK_MINUTES / 60} ชั่วโมง` }, 403);
    }

    return c.json({ error: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (${attempts}/${MAX_ATTEMPTS})` }, 401);
  }

  // Reset failed count
  await executeQuery(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
    [user.UserID],
    c.env
  );

  const userData = {
    id: user.UserID,
    name: user.Name,
    email: user.Email,
    role: user.Role,
    forceChangePassword: user.force_change_password === 1,
  };

  const sessionId = await createSession(userData, c.env);

  c.header('Set-Cookie', `session=${sessionId}; HttpOnly; SameSite=Lax; Max-Age=${21600}; Path=/`);

  return c.json({
    success: true,
    user: userData,
  });
});

// POST /api/auth/logout
auth.post('/logout', async (c) => {
  const sessionId = c.get('sessionId');
  await destroySession(sessionId, c.env);
  
  c.header('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
  return c.json({ success: true });
});

// GET /api/auth/me
auth.get('/me', requireAuth, (c) => {
  const session = c.get('session');
  return c.json({ user: session.user });
});

// POST /api/auth/change-password
auth.post('/change-password', requireAuth, async (c) => {
  const { currentPassword, newPassword, confirmPassword, otpToken } = await c.req.json();
  const session = c.get('session');

  // Server-side OTP gate: a valid, unused OTP-verified token (issued by
  // /api/otp/verify) is required. This closes the gap where the client-side
  // otpVerified flag could be bypassed by calling this endpoint directly.
  const verifiedRaw = otpToken ? await c.env.SESSIONS.get(`otp-verified:${otpToken}`) : null;
  if (!verifiedRaw) {
    return c.json({ error: 'กรุณายืนยัน OTP ก่อนเปลี่ยนรหัสผ่าน' }, 403);
  }
  const verifiedData = JSON.parse(verifiedRaw);
  if (verifiedData.userId !== session.user.id) {
    return c.json({ error: 'OTP ไม่ตรงกับผู้ใช้' }, 403);
  }
  // One-time use: invalidate the token immediately
  await c.env.SESSIONS.delete(`otp-verified:${otpToken}`);

  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'รหัสผ่านใหม่ต้องมีความยาวไม่น้อยกว่า 6 ตัวอักษร (FR-19)' }, 400);
  }
  if (newPassword !== confirmPassword) {
    return c.json({ error: 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน (FR-19)' }, 400);
  }

  const users = await executeQuery(
    'SELECT Password, force_change_password FROM users WHERE UserID = ?',
    [session.user.id],
    c.env
  );
  
  const user = users[0];

  // If not force change, verify current password
  if (!user.force_change_password) {
    const valid = await verifyPassword(currentPassword, user.Password);
    if (!valid) {
      return c.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 401);
    }
  }

  const hashedPassword = await hashPassword(newPassword);

  await executeQuery(
    'UPDATE users SET Password = ?, force_change_password = 0 WHERE UserID = ?',
    [hashedPassword, session.user.id],
    c.env
  );

  // Update session in KV store to reflect the password change
  const sessionId = c.get('sessionId');
  if (sessionId) {
    const updatedSessionData = {
      user: {
        ...session.user,
        forceChangePassword: false
      },
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    };
    await c.env.SESSIONS.put(sessionId, JSON.stringify(updatedSessionData), {
      expirationTtl: 21600 // 6 hours in seconds
    });
  }

  return c.json({ success: true });
});

export default auth;
