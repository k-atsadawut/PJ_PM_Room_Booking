import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';

const rooms = new Hono();

const OPEN_TIME = '08:30';
const CLOSE_TIME = '17:00';

// Helper function to generate all possible 30-minute time slots
function generateTimeSlots() {
  const slots = [];
  for (let hour = 8; hour <= 17; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      if (timeStr >= OPEN_TIME && timeStr <= CLOSE_TIME) {
        slots.push(timeStr);
      }
    }
  }
  return slots;
}

// Helper function to calculate available time slots based on booked slots
function calculateAvailableSlots(bookedSlots) {
  const allSlots = generateTimeSlots();
  const bookedSet = new Set();
  
  // Mark all time ranges that are booked
  bookedSlots.forEach(booking => {
    let currentTime = booking.start;
    while (currentTime < booking.end) {
      bookedSet.add(currentTime);
      // Move to next 30-minute slot
      const [hours, mins] = currentTime.split(':').map(Number);
      const totalMins = hours * 60 + mins + 30;
      const nextHours = Math.floor(totalMins / 60);
      const nextMins = totalMins % 60;
      currentTime = `${String(nextHours).padStart(2, '0')}:${String(nextMins).padStart(2, '0')}`;
    }
  });
  
  // Available slots are those not in booked set
  return allSlots.filter(slot => !bookedSet.has(slot));
}

// GET /api/rooms — ดูรายการห้องทั้งหมด พร้อมสถานะการจองวันนี้ (FR-04, FR-10)
rooms.get('/', requireAuth, async (c) => {
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];

  const result = await executeQuery(`
    SELECT
      r.RoomID,
      r.RoomName,
      r.Capacity,
      r.Status AS RoomStatus,
      r.Description,
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
          AND b.Status = 'approved'
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

  // Parse bookings_today JSON string → array and calculate available slots
  const roomsWithParsed = result.map(room => {
    let bookings = room.bookings_today;
    if (typeof bookings === 'string') {
      try { bookings = JSON.parse(bookings); } catch { bookings = []; }
    }
    if (!Array.isArray(bookings)) bookings = [];
    
    const availableSlots = calculateAvailableSlots(bookings);
    
    return { 
      ...room, 
      bookings_today: bookings,
      available_slots: availableSlots,
      occupied_slots: bookings
    };
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
          AND b.Status = 'approved'
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

  return c.json({ success: true, roomId: result.insertId || result.lastInsertId });
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
