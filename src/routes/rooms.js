import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';

const rooms = new Hono();

// GET /api/rooms — ดูรายการห้องทั้งหมด
rooms.get('/', requireAuth, async (c) => {
  const result = await executeQuery(
    'SELECT * FROM rooms ORDER BY RoomName',
    [],
    c.env
  );
  
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
