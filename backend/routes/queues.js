const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');
const router = express.Router();

// GET /api/queues — ดูคิวของตัวเอง
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT q.*, r.RoomName, u.Name AS UserName
    FROM queues q
    JOIN rooms r ON q.RoomID = r.RoomID
    JOIN users u ON q.UserID = u.UserID
    WHERE q.UserID = ?
    ORDER BY q.QueueDate ASC, q.created_at ASC
  `, [req.session.user.id]);

  res.json(rows);
});

// POST /api/queues — เข้าคิว (FR-13)
router.post('/', requireAuth, async (req, res) => {
  const { roomId, date, start, end } = req.body;

  if (!roomId || !date || !start || !end) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  // เช็คว่ามี booking ชนกันจริงหรือไม่
  const [conflicts] = await db.execute(`
    SELECT BookingID FROM bookings
    WHERE RoomID = ?
      AND BookingDate = ?
      AND Status IN ('pending','approved')
      AND StartTime < ? AND EndTime > ?
    LIMIT 1
  `, [roomId, date, end, start]);

  if (conflicts.length === 0) {
    return res.status(400).json({ error: 'ช่วงเวลานี้ว่างอยู่ สามารถจองได้เลย ไม่ต้องเข้าคิว' });
  }

  // เช็คว่าเคยเข้าคิวช่วงเวลานี้ไปแล้วหรือยัง
  const [existing] = await db.execute(`
    SELECT QueueID FROM queues
    WHERE UserID = ?
      AND RoomID = ?
      AND QueueDate = ?
      AND StartTime = ?
      AND EndTime = ?
      AND Status = 'waiting'
  `, [req.session.user.id, roomId, date, start, end]);

  if (existing.length > 0) {
    return res.status(400).json({ error: 'คุณอยู่ในคิวช่วงเวลานี้แล้ว' });
  }

  // เพิ่มเข้าคิว
  const [result] = await db.execute(`
    INSERT INTO queues (UserID, RoomID, QueueDate, StartTime, EndTime, Status)
    VALUES (?, ?, ?, ?, ?, 'waiting')
  `, [req.session.user.id, roomId, date, start, end]);

  res.json({ success: true, queueId: result.insertId });
});

// DELETE /api/queues/:id — ออกจากคิว
router.delete('/:id', requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM queues WHERE QueueID = ? AND UserID = ? AND Status = "waiting"',
    [req.params.id, req.session.user.id]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'ไม่พบคิวนี้ หรือคิวถูกยกเลิกแล้ว' });
  }

  await db.execute(
    'UPDATE queues SET Status = "cancelled" WHERE QueueID = ?',
    [req.params.id]
  );

  res.json({ success: true });
});

// ฟังก์ชันภายใน: ตรวจสอบคิวเมื่อมีการ cancel/reject booking
// เรียกใช้จาก bookings.js และ admin/bookings.js
async function checkAndNotifyQueue(roomId, date, start, end) {
  try {
    // ค้นหาคิวที่รอช่วงเวลานี้ (เรียงตามลำดับเวลาเข้าคิว)
    const [queues] = await db.execute(`
      SELECT q.*, u.Name, u.Email, r.RoomName
      FROM queues q
      JOIN users u ON q.UserID = u.UserID
      JOIN rooms r ON q.RoomID = r.RoomID
      WHERE q.RoomID = ?
        AND q.QueueDate = ?
        AND q.StartTime = ?
        AND q.EndTime = ?
        AND q.Status = 'waiting'
      ORDER BY q.created_at ASC
      LIMIT 1
    `, [roomId, date, start, end]);

    if (queues.length > 0) {
      const queue = queues[0];
      
      // แจ้งเตือนคนที่รออยู่
      const subject = 'ช่วงเวลาที่คุณรอจองว่างแล้ว';
      const text = `
เรียน ${queue.Name},

ช่วงเวลาที่คุณรอจองว่างแล้ว:

ห้อง: ${queue.RoomName}
วันที่: ${queue.QueueDate}
เวลา: ${queue.StartTime} - ${queue.EndTime}

กรุณาเข้าสู่ระบบเพื่อทำการจองภายใน 30 นาที
      `.trim();

      if (queue.Email) {
        await sendEmail({ to: queue.Email, subject, text });
      }

      // สร้าง notification ในระบบ
      await db.execute(`
        INSERT INTO notifications (UserID, Message, created_at)
        VALUES (?, ?, NOW())
      `, [queue.UserID, `ช่วงเวลา ${queue.StartTime}-${queue.EndTime} วันที่ ${queue.QueueDate} ว่างแล้ว กรุณาจองภายใน 30 นาที`]);

      // อัปเดตสถานะคิวเป็น notified
      await db.execute(
        'UPDATE queues SET Status = "notified" WHERE QueueID = ?',
        [queue.QueueID]
      );

      console.log(`[Queue] Notified user ${queue.UserID} for available slot`);
    }
  } catch (error) {
    console.error('[Queue] Error checking queue:', error);
  }
}

module.exports = router;
module.exports.checkAndNotifyQueue = checkAndNotifyQueue;
