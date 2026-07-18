const express = require('express');
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// GET /api/rooms — ดูห้องทั้งหมดพร้อมสถานะวันนี้ (FR-04, FR-10)
router.get('/', async (req, res) => {
  const today = req.query.date || new Date().toISOString().split('T')[0];

  const [rooms] = await db.execute(`
    SELECT
      r.RoomID,
      r.RoomName,
      r.Capacity,
      r.Status,
      r.Description,
      JSON_ARRAYAGG(
        IF(b.BookingID IS NOT NULL,
          JSON_OBJECT(
            'bookingId', b.BookingID,
            'start',     b.StartTime,
            'end',       b.EndTime,
            'status',    b.Status
          ),
          NULL
        )
      ) AS bookings_today,
      CASE WHEN EXISTS (
        SELECT 1 FROM bookings b2
        WHERE b2.RoomID = r.RoomID
          AND b2.BookingDate = ?
          AND b2.Status = 'approved'
          AND b2.StartTime <= CURTIME() AND b2.EndTime > CURTIME()
      ) THEN 'booked'
      ELSE r.Status END AS current_status
    FROM rooms r
    LEFT JOIN bookings b
      ON b.RoomID = r.RoomID
      AND b.BookingDate = ?
      AND b.Status IN ('pending','approved')
    GROUP BY r.RoomID
    ORDER BY r.RoomName
  `, [today, today]);

  // กรอง null ออกจาก JSON_ARRAYAGG
  const result = rooms.map(room => {
    try {
      return {
        ...room,
        bookings_today: (JSON.parse(room.bookings_today) || []).filter(Boolean),
      };
    } catch (e) {
      return {
        ...room,
        bookings_today: [],
      };
    }
  });

  res.json(result);
});

// GET /api/rooms/availability?date=YYYY-MM-DD — ตรวจสถานะว่างของห้องทั้งหมดในวันที่ระบุ (FR-10)
router.get('/availability', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องระบุพารามิเตอร์ date (YYYY-MM-DD)' });
  }

  const [rows] = await db.execute(`
    SELECT
      r.RoomID,
      r.RoomName,
      r.Status AS RoomStatus,
      COALESCE((
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'start',  b.StartTime,
          'end',    b.EndTime,
          'status', b.Status
        ))
        FROM bookings b
        WHERE b.RoomID = r.RoomID
          AND b.BookingDate = ?
          AND b.Status IN ('pending','approved')
      ), JSON_ARRAY()) AS booked_slots
    FROM rooms r
    ORDER BY r.RoomName
  `, [date]);

  const result = rows.map(r => {
    let slots = r.booked_slots;
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { slots = []; }
    }
    return {
      roomId:   r.RoomID,
      roomName: r.RoomName,
      roomStatus: r.RoomStatus,
      bookedSlots: Array.isArray(slots) ? slots : [],
      available: r.RoomStatus === 'available' && (!Array.isArray(slots) || slots.length === 0),
    };
  });

  res.json(result);
});

// POST /api/rooms — เพิ่มห้อง (Admin only)
router.post('/', requireAuth, async (req, res) => {
  const { RoomName, Capacity, Status, Description } = req.body;

  // Check if user is admin
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เพิ่มห้อง' });
  }

  // SRS_v3 §2.3 / BR-05 / FR-04: ระบบรองรับห้องจำนวน 4 ห้องเท่านั้น
  const [[{ roomCount }]] = await db.execute('SELECT COUNT(*) AS roomCount FROM rooms');
  if (roomCount >= 4) {
    return res.status(400).json({ error: 'ระบบรองรับห้องได้สูงสุด 4 ห้องเท่านั้น (ตาม SRS_v3)' });
  }

  // SRS_v3 §2.3 / BR-05: ความจุห้องละ 1 คน
  if (Capacity !== undefined && Number(Capacity) !== 1) {
    return res.status(400).json({ error: 'ความจุห้องต้องเป็น 1 คนตาม SRS_v3' });
  }

  try {
    await db.execute(
      'INSERT INTO rooms (RoomName, Capacity, Status, Description) VALUES (?, ?, ?, ?)',
      [RoomName, 1, Status || 'available', Description || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เพิ่มห้องไม่สำเร็จ' });
  }
});

// PUT /api/rooms/:id — แก้ไขห้อง (Admin only)
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { RoomName, Capacity, Status, Description } = req.body;

  // Check if user is admin
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขห้อง' });
  }

  // SRS_v3 §2.3 / BR-05: ความจุห้องละ 1 คน
  if (Capacity !== undefined && Number(Capacity) !== 1) {
    return res.status(400).json({ error: 'ความจุห้องต้องเป็น 1 คนตาม SRS_v3' });
  }

  try {
    await db.execute(
      'UPDATE rooms SET RoomName = ?, Capacity = ?, Status = ?, Description = ?, updated_at = CURRENT_TIMESTAMP WHERE RoomID = ?',
      [RoomName, 1, Status, Description || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'แก้ไขห้องไม่สำเร็จ' });
  }
});

// DELETE /api/rooms/:id — ลบห้อง (Admin only)
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  // Check if user is admin
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบห้อง' });
  }

  try {
    await db.execute('DELETE FROM rooms WHERE RoomID = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'ลบห้องไม่สำเร็จ' });
  }
});

module.exports = router;
