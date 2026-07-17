import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { createSession, destroySession, getSession } from '../middleware/session';
import { hashPassword, verifyPassword } from '../utils/password';
import { evaluateLoginAttempt, DEFAULT_MAX_ATTEMPTS, DEFAULT_LOCK_MINUTES } from '../utils/authLock';
import { executeQuery } from '../config/db';

const auth = new Hono();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400);
  }

  // FR-19: อ่าน config จาก env (wrangler.toml [vars]) — ไม่ hardcode
  const maxAttempts = Number(c.env?.MAX_LOGIN_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS;
  const lockMinutes = Number(c.env?.LOGIN_LOCK_MINUTES) || DEFAULT_LOCK_MINUTES;

  const users = await executeQuery(
    'SELECT * FROM users WHERE Email = ? LIMIT 1',
    [email],
    c.env
  );

  const user = users[0];

  if (!user) {
    return c.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }

  const passwordValid = await verifyPassword(password, user.Password);

  const result = evaluateLoginAttempt({
    user,
    passwordValid,
    now: new Date(),
    maxAttempts,
    lockMinutes,
  });

  // ── เขียน DB state ตามผล ──
  if (result.action === 'allow' && result.shouldResetCount) {
    await executeQuery(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
      [user.UserID],
      c.env
    );
  } else if (result.action === 'lock' && result.shouldResetCount) {
    await executeQuery(
      'UPDATE users SET failed_login_count = 0, locked_until = ? WHERE UserID = ?',
      [result.lockedUntil, user.UserID],
      c.env
    );
  } else if (result.action === 'reject') {
    const expectedCount = Number(user.failed_login_count) || 0;
    await executeQuery(
      'UPDATE users SET failed_login_count = ? WHERE UserID = ? AND failed_login_count = ?',
      [result.attempts, user.UserID, expectedCount],
      c.env
    );
  }

  // ── response ──
  if (result.action === 'lock') {
    return c.json({ error: result.errorMessage, isLocked: true }, 403);
  }
  if (result.action === 'reject') {
    return c.json({ error: result.errorMessage }, 401);
  }

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
  const { currentPassword, newPassword, confirmPassword } = await c.req.json();
  const session = c.get('session');

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
