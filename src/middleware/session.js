import { createMiddleware } from 'hono/factory';
import { executeQuery } from '../config/db';

const SESSION_LIFETIME = 21600000; // 6 hours (in milliseconds)

// Create sessions table if not exists (run on first use)
async function ensureSessionsTable() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        data JSON NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        INDEX idx_expires_at (expires_at)
      )
    `);
  } catch (error) {
    console.error('Error creating sessions table:', error);
  }
}

export const sessionMiddleware = createMiddleware(async (c, next) => {
  const sessionId = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];
  
  if (sessionId) {
    const sessionData = await getSession(sessionId);
    if (sessionData) {
      c.set('session', sessionData);
      c.set('sessionId', sessionId);
    }
  }
  
  await next();
});

export const createSession = async (userData) => {
  await ensureSessionsTable();
  
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const sessionData = {
    user: userData,
    createdAt: now,
    expiresAt: now + SESSION_LIFETIME
  };
  
  await executeQuery(
    'INSERT INTO sessions (session_id, data, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [sessionId, JSON.stringify(sessionData), sessionData.expiresAt, now]
  );
  
  return sessionId;
};

export const destroySession = async (sessionId) => {
  if (sessionId) {
    await executeQuery('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
  }
};

export const getSession = async (sessionId) => {
  if (!sessionId) return null;
  
  const sessions = await executeQuery(
    'SELECT data, expires_at FROM sessions WHERE session_id = ?',
    [sessionId]
  );
  
  if (sessions.length === 0) {
    return null;
  }
  
  const session = sessions[0];
  const now = Date.now();
  
  // Check if session has expired
  if (session.expires_at < now) {
    // Delete expired session
    await executeQuery('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    return null;
  }
  
  return JSON.parse(session.data);
};

// Cleanup expired sessions (call this periodically)
export async function cleanupExpiredSessions() {
  const now = Date.now();
  await executeQuery('DELETE FROM sessions WHERE expires_at < ?', [now]);
}
