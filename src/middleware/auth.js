import { createMiddleware } from 'hono/factory';

export const requireAuth = createMiddleware(async (c, next) => {
  const session = c.get('session');
  
  if (!session || !session.user) {
    return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  }
  
  await next();
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const session = c.get('session');
  
  if (!session || !session.user) {
    return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  }
  
  if (session.user.role !== 'admin') {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, 403);
  }
  
  await next();
});
