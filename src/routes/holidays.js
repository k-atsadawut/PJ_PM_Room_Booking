import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';

const holidays = new Hono();

// GET /api/holidays — ดูวันหยุดทั้งหมด
holidays.get('/', requireAuth, async (c) => {
  const result = await executeQuery(
    'SELECT * FROM holidays ORDER BY HolidayDate DESC'
  );
  
  return c.json(result);
});

// POST /api/holidays — เพิ่มวันหยุด (admin only)
holidays.post('/', requireAdmin, async (c) => {
  const { HolidayDate, Description } = await c.req.json();
  
  if (!HolidayDate) {
    return c.json({ error: 'กรุณาระบุวันที่' }, 400);
  }

  const result = await executeQuery(
    'INSERT INTO holidays (HolidayDate, Description) VALUES (?, ?)',
    [HolidayDate, Description || null]
  );

  return c.json({ success: true, holidayId: result.insertId });
});

// DELETE /api/holidays/:id — ลบวันหยุด (admin only)
holidays.delete('/:id', requireAdmin, async (c) => {
  const holidayId = c.req.param('id');

  await executeQuery(
    'DELETE FROM holidays WHERE HolidayID = ?',
    [holidayId]
  );

  return c.json({ success: true });
});

export default holidays;
