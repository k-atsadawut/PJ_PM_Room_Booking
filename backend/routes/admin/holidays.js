const express = require('express');
const db      = require('../../config/db');
const { requireAdmin } = require('../../middleware/auth');
const router  = express.Router();

// GET /api/admin/holidays
router.get('/', requireAdmin, async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM holidays ORDER BY HolidayDate ASC');
  res.json(rows);
});

// POST /api/admin/holidays
router.post('/', requireAdmin, async (req, res) => {
  const { date, description, HolidayDate, Description } = req.body;
  const targetDate = date || HolidayDate;
  const targetDesc = description || Description;
  if (!targetDate) return res.status(400).json({ error: 'กรุณาระบุวันที่' });

  await db.execute(
    'INSERT INTO holidays (HolidayDate, Description) VALUES (?, ?)',
    [targetDate, targetDesc || null]
  );
  res.json({ success: true });
});

// DELETE /api/admin/holidays/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  await db.execute('DELETE FROM holidays WHERE HolidayID = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
