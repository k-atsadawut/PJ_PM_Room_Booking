import { createMiddleware } from 'hono/factory';

const SESSION_LIFETIME = 21600000; // 6 hours (in milliseconds)

export const sessionMiddleware = createMiddleware(async (c, next) => {
  const cookieHeader = c.req.header('cookie') || c.req.header('Cookie');
  const sessionId = cookieHeader?.match(/session=([^;]+)/)?.[1];
  const env = c.env;
  
  if (sessionId && env?.SESSIONS) {
    const sessionData = await getSession(sessionId, env);
    if (sessionData) {
      c.set('session', sessionData);
      c.set('sessionId', sessionId);
    }
  }
  
  await next();
});

export const createSession = async (userData, env) => {
  if (!env?.SESSIONS) {
    throw new Error('SESSIONS KV binding not available');
  }
  
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const sessionData = {
    user: userData,
    createdAt: now,
    expiresAt: now + SESSION_LIFETIME
  };
  
  // Store in KV with expiration
  await env.SESSIONS.put(sessionId, JSON.stringify(sessionData), {
    expirationTtl: SESSION_LIFETIME / 1000 // Convert to seconds
  });
  
  return sessionId;
};

export const destroySession = async (sessionId, env) => {
  if (sessionId && env?.SESSIONS) {
    await env.SESSIONS.delete(sessionId);
  }
};

export const getSession = async (sessionId, env) => {
  if (!sessionId || !env?.SESSIONS) return null;
  
  const sessionData = await env.SESSIONS.get(sessionId);
  
  if (!sessionData) {
    return null;
  }
  
  return JSON.parse(sessionData);
};
