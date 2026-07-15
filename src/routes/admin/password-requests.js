import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { hashPassword } from '../../utils/password';
import { executeQuery } from '../../config/db';

const adminPasswordRequests = new Hono();

// GET /api/admin/password-requests — ดูคำขอรีเซ็ตรหัสผ่านทั้งหมด
adminPasswordRequests.get('/', requireAdmin, async (c) => {
  const { status } = c.req.query();

  let query = `
    SELECT pr.*, u.Name AS UserName
    FROM password_reset_requests pr
    JOIN users u ON pr.UserID = u.UserID
  `;

  const params = [];
  const conditions = [];

  if (status) {
    conditions.push('pr.Status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY pr.RequestDate DESC';

  const result = await executeQuery(query, params, c.env);
  
  return c.json(result);
});

// PATCH /api/admin/password-requests/:id/approve — อนุมัติคำขอรีเซ็ตรหัสผ่าน
adminPasswordRequests.patch('/:id/approve', requireAdmin, async (c) => {
  const requestId = c.req.param('id');

  // Get request details
  const request = await executeQuery(
    'SELECT UserID FROM password_reset_requests WHERE RequestID = ?',
    [requestId],
    c.env
  );

  if (request.length === 0) {
    return c.json({ error: 'ไม่พบคำขอนี้' }, 404);
  }

  const userId = request[0].UserID;
  const session = c.get('session');
  const adminId = session.user.id;

  // Set force_change_password = 1 so user can change their own password
  await executeQuery(
    'UPDATE users SET force_change_password = 1 WHERE UserID = ?',
    [userId],
    c.env
  );

  // Update request status
  await executeQuery(
    "UPDATE password_reset_requests SET Status = 'approved', ProcessedDate = NOW(), ProcessedBy = ? WHERE RequestID = ?",
    [adminId, requestId],
    c.env
  );

  return c.json({ success: true, message: 'อนุมัติคำขอเรียบร้อยแล้ว ผู้ใช้สามารถเปลี่ยนรหัสผ่านได้' });
});

// PATCH /api/admin/password-requests/:id/reject — ปฏิเสธคำขอรีเซ็ตรหัสผ่าน
adminPasswordRequests.patch('/:id/reject', requireAdmin, async (c) => {
  const requestId = c.req.param('id');
  const { Notes } = await c.req.json();

  const session = c.get('session');
  const adminId = session.user.id;

  await executeQuery(
    "UPDATE password_reset_requests SET Status = 'rejected', ProcessedDate = NOW(), ProcessedBy = ?, Notes = ? WHERE RequestID = ?",
    [adminId, Notes || null, requestId],
    c.env
  );

  return c.json({ success: true });
});

export default adminPasswordRequests;
