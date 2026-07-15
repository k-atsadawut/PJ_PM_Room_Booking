import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';

const holidays = new Hono();

// GET /api/holidays — ดูวันหยุดทั้งหมด
holidays.get('/', requireAuth, async (c) => {
  const result = await executeQuery(
    'SELECT * FROM holidays ORDER BY HolidayDate DESC',
    [],
    c.env
  );
  
  return c.json(result);
});

// GET /api/holidays/today — ดูวันหยุดวันนี้
holidays.get('/today', async (c) => {
  const today = new Date().toISOString().split('T')[0];
  const result = await executeQuery(
    'SELECT * FROM holidays WHERE HolidayDate = ? LIMIT 1',
    [today],
    c.env
  );
  
  if (result.length === 0) {
    return c.json(null);
  }
  
  return c.json(result[0]);
});

// POST /api/holidays — เพิ่มวันหยุด (admin only)
holidays.post('/', requireAdmin, async (c) => {
  const { HolidayDate, Description } = await c.req.json();
  
  if (!HolidayDate) {
    return c.json({ error: 'กรุณาระบุวันที่' }, 400);
  }

  const result = await executeQuery(
    'INSERT INTO holidays (HolidayDate, Description) VALUES (?, ?)',
    [HolidayDate, Description || null],
    c.env
  );

  return c.json({ success: true, holidayId: result.insertId });
});

// DELETE /api/holidays/:id — ลบวันหยุด (admin only)
holidays.delete('/:id', requireAdmin, async (c) => {
  const holidayId = c.req.param('id');

  await executeQuery(
    'DELETE FROM holidays WHERE HolidayID = ?',
    [holidayId],
    c.env
  );

  return c.json({ success: true });
});

export default holidays;
