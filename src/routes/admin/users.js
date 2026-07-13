import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { hashPassword } from '../../utils/password';
import { executeQuery } from '../../config/db';

const adminUsers = new Hono();

// GET /api/admin/users — ดูรายชื่อผู้ใช้ทั้งหมด
adminUsers.get('/', requireAdmin, async (c) => {
  const result = await executeQuery(
    'SELECT UserID, Name, Email, Role, Faculty, Department, created_at FROM users ORDER BY Name'
  );
  
  return c.json(result);
});

// POST /api/admin/users — เพิ่มผู้ใช้ใหม่
adminUsers.post('/', requireAdmin, async (c) => {
  const { Name, Email, Password, Role, Faculty, Department } = await c.req.json();
  
  if (!Name || !Email || !Password || !Role) {
    return c.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, 400);
  }

  const hashedPassword = await hashPassword(Password);

  const result = await executeQuery(
    'INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [Name, Email, hashedPassword, Role, Faculty, Department]
  );

  return c.json({ success: true, userId: result.insertId });
});

// PATCH /api/admin/users/:id — แก้ไขผู้ใช้
adminUsers.patch('/:id', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const { Name, Email, Role, Faculty, Department, force_change_password } = await c.req.json();

  const updates = [];
  const values = [];

  if (Name !== undefined) {
    updates.push('Name = ?');
    values.push(Name);
  }
  if (Email !== undefined) {
    updates.push('Email = ?');
    values.push(Email);
  }
  if (Role !== undefined) {
    updates.push('Role = ?');
    values.push(Role);
  }
  if (Faculty !== undefined) {
    updates.push('Faculty = ?');
    values.push(Faculty);
  }
  if (Department !== undefined) {
    updates.push('Department = ?');
    values.push(Department);
  }
  if (force_change_password !== undefined) {
    updates.push('force_change_password = ?');
    values.push(force_change_password ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: 'ไม่มีข้อมูลที่จะอัปเดต' }, 400);
  }

  values.push(userId);

  await executeQuery(
    `UPDATE users SET ${updates.join(', ')} WHERE UserID = ?`,
    values
  );

  return c.json({ success: true });
});

// DELETE /api/admin/users/:id — ลบผู้ใช้
adminUsers.delete('/:id', requireAdmin, async (c) => {
  const userId = c.req.param('id');

  await executeQuery(
    'DELETE FROM users WHERE UserID = ?',
    [userId]
  );

  return c.json({ success: true });
});

export default adminUsers;
