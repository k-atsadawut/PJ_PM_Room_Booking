import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const maintenance = new Hono();

// POST /api/maintenance — แจ้งปัญหา/ซ่อมบำรุง
maintenance.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { RoomID, Description, Urgency } = await c.req.json();

  if (!RoomID || !Description) {
    return c.json({ error: 'กรุณาระบุห้องและรายละเอียดปัญหา' }, 400);
  }

  const result = await executeQuery(
    'INSERT INTO maintenance_reports (RoomID, UserID, Description, Urgency, Status) VALUES (?, ?, ?, ?, ?)',
    [RoomID, session.user.id, Description, Urgency || 'normal', 'pending']
  );

  return c.json({ success: true, reportId: result.insertId });
});

// GET /api/maintenance — ดูรายการแจ้งซ่อมของตัวเอง
maintenance.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT mr.*, r.RoomName
    FROM maintenance_reports mr
    JOIN rooms r ON mr.RoomID = r.RoomID
    WHERE mr.UserID = ?
    ORDER BY mr.ReportDate DESC
  `, [session.user.id]);

  return c.json(result);
});

export default maintenance;
