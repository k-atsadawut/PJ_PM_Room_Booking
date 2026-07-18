import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';

const rooms = new Hono();

// GET /api/rooms — ดูรายการห้องทั้งหมด พร้อมสถานะการจองวันนี้ (FR-04, FR-10)
rooms.get('/', requireAuth, async (c) => {
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];

  const result = await executeQuery(`
    SELECT
      r.RoomID,
      r.RoomName,
      r.Capacity,
      r.Status AS RoomStatus,
      COALESCE((
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'bookingId', b.BookingID,
          'start',     b.StartTime,
          'end',       b.EndTime,
          'status',    b.Status
        ))
        FROM bookings b
        WHERE b.RoomID = r.RoomID
          AND b.BookingDate = ?
          AND b.Status IN ('pending','approved')
      ), JSON_ARRAY()) AS bookings_today,
      CASE WHEN EXISTS (
        SELECT 1 FROM bookings b2
        WHERE b2.RoomID = r.RoomID
          AND b2.BookingDate = ?
          AND b2.Status = 'approved'
          AND b2.StartTime <= CURTIME() AND b2.EndTime > CURTIME()
      ) THEN 'booked'
      ELSE r.Status END AS current_status
    FROM rooms r
    ORDER BY r.RoomName
  `, [date, date], c.env);

  // Parse bookings_today JSON string → array (MySQL JSON_ARRAYAGG returns string in some drivers)
  const roomsWithParsed = result.map(room => {
    let bookings = room.bookings_today;
    if (typeof bookings === 'string') {
      try { bookings = JSON.parse(bookings); } catch { bookings = []; }
    }
    if (!Array.isArray(bookings)) bookings = [];
    return { ...room, bookings_today: bookings };
  });

  return c.json(roomsWithParsed);
});

// GET /api/rooms/availability?date=YYYY-MM-DD — ตรวจสถานะว่างของห้องทั้งหมดในวันที่ระบุ (FR-10)
rooms.get('/availability', requireAuth, async (c) => {
  const date = c.req.query('date');
  if (!date) {
    return c.json({ error: 'ต้องระบุพารามิเตอร์ date (YYYY-MM-DD)' }, 400);
  }

  const rows = await executeQuery(`
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
  `, [date], c.env);

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

  return c.json(result);
});

// POST /api/rooms — เพิ่มห้อง (admin only)
rooms.post('/', requireAdmin, async (c) => {
  const { RoomName, Capacity, Status, Description } = await c.req.json();
  
  if (!RoomName) {
    return c.json({ error: 'กรุณาระบุชื่อห้อง' }, 400);
  }

  const result = await executeQuery(
    'INSERT INTO rooms (RoomName, Capacity, Status, Description) VALUES (?, ?, ?, ?)',
    [RoomName, Capacity || 1, Status || 'available', Description || null],
    c.env
  );

  return c.json({ success: true, roomId: result.insertId });
});

// PATCH /api/rooms/:id — แก้ไขห้อง (admin only)
rooms.patch('/:id', requireAdmin, async (c) => {
  const roomId = c.req.param('id');
  const { RoomName, Capacity, Status, Description } = await c.req.json();

  const updates = [];
  const values = [];

  if (RoomName !== undefined) {
    updates.push('RoomName = ?');
    values.push(RoomName);
  }
  if (Capacity !== undefined) {
    updates.push('Capacity = ?');
    values.push(Capacity);
  }
  if (Status !== undefined) {
    updates.push('Status = ?');
    values.push(Status);
  }
  if (Description !== undefined) {
    updates.push('Description = ?');
    values.push(Description);
  }

  if (updates.length === 0) {
    return c.json({ error: 'ไม่มีข้อมูลที่จะอัปเดต' }, 400);
  }

  values.push(roomId);

  await executeQuery(
    `UPDATE rooms SET ${updates.join(', ')} WHERE RoomID = ?`,
    values,
    c.env
  );

  return c.json({ success: true });
});

// DELETE /api/rooms/:id — ลบห้อง (admin only)
rooms.delete('/:id', requireAdmin, async (c) => {
  const roomId = c.req.param('id');

  await executeQuery(
    'DELETE FROM rooms WHERE RoomID = ?',
    [roomId],
    c.env
  );

  return c.json({ success: true });
});

export default rooms;
