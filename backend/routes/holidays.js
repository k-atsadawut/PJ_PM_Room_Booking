const express = require('express');
const db = require('../config/db');
const router = express.Router();

// GET /api/holidays - Get all upcoming/current holidays
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT HolidayID, HolidayDate, Description
      FROM holidays
      WHERE HolidayDate >= CURDATE()
      ORDER BY HolidayDate ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลวันหยุด' });
  }
});

// GET /api/holidays/today - Get today's holiday
router.get('/today', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT HolidayID, HolidayDate, Description
      FROM holidays
      WHERE HolidayDate = CURDATE()
      LIMIT 1
    `);
    res.json(rows[0] || null);
  } catch (error) {
    console.error('Get today holiday error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลวันหยุด' });
  }
});

module.exports = router;

