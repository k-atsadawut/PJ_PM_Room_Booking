import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const queues = new Hono();

// POST /api/queues — เข้าคิวรอจอง
queues.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { roomId, date, start, end } = await c.req.json();

  if (!roomId || !date || !start || !end) {
    return c.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, 400);
  }

  // Check if already in queue for this slot
  const existing = await executeQuery(`
    SELECT QueueID FROM queues
    WHERE UserID = ? AND RoomID = ? AND BookingDate = ? AND StartTime = ? AND EndTime = ?
      AND Status = 'waiting'
    LIMIT 1
  `, [session.user.id, roomId, date, start, end], c.env);

  if (existing.length > 0) {
    return c.json({ error: 'คุณอยู่ในคิวสำหรับช่วงเวลานี้แล้ว' }, 400);
  }

  const result = await executeQuery(`
    INSERT INTO queues (UserID, RoomID, BookingDate, StartTime, EndTime, Status)
    VALUES (?, ?, ?, ?, ?, 'waiting')
  `, [session.user.id, roomId, date, start, end], c.env);

  return c.json({ success: true, queueId: result.insertId || result.lastInsertId });
});

// GET /api/queues — ดูคิวของตัวเอง
queues.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT q.*, r.RoomName
    FROM queues q
    JOIN rooms r ON q.RoomID = r.RoomID
    WHERE q.UserID = ?
    ORDER BY q.created_at DESC
  `, [session.user.id], c.env);

  return c.json(result);
});

// DELETE /api/queues/:id — ออกจากคิว
queues.delete('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  const queueId = c.req.param('id');

  await executeQuery(
    "UPDATE queues SET Status = 'cancelled' WHERE QueueID = ? AND UserID = ?",
    [queueId, session.user.id],
    c.env
  );

  return c.json({ success: true });
});

// Function to check and notify queue (used by bookings cancel)
export async function checkAndNotifyQueue(roomId, bookingDate, startTime, endTime, env) {
  // Find waiting users for this slot
  const waitingUsers = await executeQuery(`
    SELECT q.QueueID, q.UserID, u.Email, u.Name
    FROM queues q
    JOIN users u ON q.UserID = u.UserID
    WHERE q.RoomID = ? AND q.BookingDate = ? AND q.StartTime = ? AND q.EndTime = ?
      AND q.Status = 'waiting'
    ORDER BY q.created_at ASC
    LIMIT 1
  `, [roomId, bookingDate, startTime, endTime], env);

  if (waitingUsers.length > 0) {
    const queueUser = waitingUsers[0];
    
    // Update queue status to notified
    await executeQuery(
      "UPDATE queues SET Status = 'notified' WHERE QueueID = ?",
      [queueUser.QueueID],
      env
    );

    // Send notification
    await executeQuery(
      'INSERT INTO notifications (UserID, Message) VALUES (?, ?)',
      [
        queueUser.UserID,
        `ห้องที่คุณรอจองวันที่ ${bookingDate} เวลา ${startTime}-${endTime} ว่างแล้ว กรุณาทำการจองภายใน 15 นาที`
      ],
      env
    );

    // TODO: Send email notification
    console.log(`Queue notification sent to user ${queueUser.UserID}`);
  }
}

export default queues;
