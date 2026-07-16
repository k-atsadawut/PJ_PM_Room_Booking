import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const maintenance = new Hono();

// POST /api/maintenance — แจ้งปัญหา/ซ่อมบำรุง
maintenance.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const body = await c.req.json();
  const RoomID = body.RoomID || body.roomId;
  const Description = body.Description || body.description;
  const Urgency = body.Urgency || body.urgency;

  if (!RoomID || !Description) {
    return c.json({ error: 'กรุณาระบุห้องและรายละเอียดปัญหา' }, 400);
  }

  const result = await executeQuery(
    'INSERT INTO maintenance_reports (RoomID, UserID, Description, Urgency, Status) VALUES (?, ?, ?, ?, ?)',
    [RoomID, session.user.id, Description, Urgency || 'normal', 'pending'],
    c.env
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
  `, [session.user.id], c.env);

  return c.json(result);
});

// GET /api/maintenance/admin — ดูรายงานทั้งหมด (Admin only)
maintenance.get('/admin', requireAuth, async (c) => {
  const session = c.get('session');
  if (session.user.role !== 'admin') {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, 403);
  }

  const result = await executeQuery(`
    SELECT mr.*, r.RoomName, u.Name AS ReporterName
    FROM maintenance_reports mr
    JOIN rooms r ON mr.RoomID = r.RoomID
    JOIN users u ON mr.UserID = u.UserID
    ORDER BY mr.ReportDate DESC
  `, [], c.env);

  return c.json(result);
});

// PATCH /api/maintenance/:id — อัปเดตสถานะ (Admin only)
maintenance.patch('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  if (session.user.role !== 'admin') {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, 403);
  }

  const reportId = c.req.param('id');
  const { status, notes } = await c.req.json();

  if (!['pending', 'in_progress', 'completed', 'rejected'].includes(status)) {
    return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400);
  }

  await executeQuery(
    'UPDATE maintenance_reports SET Status = ?, Notes = ?, UpdatedDate = CURRENT_TIMESTAMP WHERE ReportID = ?',
    [status, notes || null, reportId],
    c.env
  );

  return c.json({ success: true });
});

export default maintenance;
