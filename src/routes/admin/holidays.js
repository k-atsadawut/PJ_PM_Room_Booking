import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { executeQuery } from '../../config/db';

const adminHolidays = new Hono();

// GET /api/admin/holidays — ดูวันหยุดทั้งหมด (admin view)
adminHolidays.get('/', requireAdmin, async (c) => {
  const result = await executeQuery(
    'SELECT * FROM holidays ORDER BY HolidayDate DESC',
    [],
    c.env
  );
  
  return c.json(result);
});

// POST /api/admin/holidays — เพิ่มวันหยุด
adminHolidays.post('/', requireAdmin, async (c) => {
  const { HolidayDate, Description } = await c.req.json();
  
  if (!HolidayDate) {
    return c.json({ error: 'กรุณาระบุวันที่' }, 400);
  }

  try {
    const result = await executeQuery(
      'INSERT INTO holidays (HolidayDate, Description) VALUES (?, ?)',
      [HolidayDate, Description || null],
      c.env
    );

    // Verify the insert by fetching the newly created holiday
    const verifyResult = await executeQuery(
      'SELECT * FROM holidays WHERE HolidayID = ?',
      [result.insertId],
      c.env
    );

    return c.json({ success: true, holidayId: result.insertId, holiday: verifyResult[0] });
  } catch (error) {
    console.error('Error inserting holiday:', error);
    return c.json({ error: 'ไม่สามารถเพิ่มวันหยุดได้: ' + error.message }, 500);
  }
});

// DELETE /api/admin/holidays/:id — ลบวันหยุด
adminHolidays.delete('/:id', requireAdmin, async (c) => {
  const holidayId = c.req.param('id');

  await executeQuery(
    'DELETE FROM holidays WHERE HolidayID = ?',
    [holidayId],
    c.env
  );

  return c.json({ success: true });
});

export default adminHolidays;
