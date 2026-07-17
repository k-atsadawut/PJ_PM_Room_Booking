require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const { startReminderScheduler } = require('./jobs/reminder');

const app = express();

// ─── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: true,          // อนุญาต localhost ทุก port (dev)
  credentials: true,     // ส่ง cookie ข้าม origin ได้
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_LIFETIME) || 21600000, // 6 ชม.
    sameSite: 'lax',
  },
}));

// ─── Serve Frontend (ไฟล์ HTML ใน /frontend) ──────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/rooms',          require('./routes/rooms'));
app.use('/api/bookings',       require('./routes/bookings'));
app.use('/api/queues',         require('./routes/queues'));
app.use('/api/maintenance',    require('./routes/maintenance'));
app.use('/api/forgot-password', require('./routes/password-reset'));
app.use('/api/holidays',       require('./routes/holidays'));
app.use('/api/admin/users',    require('./routes/admin/users'));
app.use('/api/admin/bookings', require('./routes/admin/bookings'));
app.use('/api/admin/holidays', require('./routes/admin/holidays'));
app.use('/api/admin/reports',  require('./routes/admin/reports'));
app.use('/api/admin/password-requests', require('./routes/admin/password-requests'));

// ─── Fallback — SPA-style redirect ────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Export app เพื่อใช้ใน integration test (boot บน port ทดสอบเอง)
module.exports = app;

// ─── Start ─────────────────────────────────────────────────────
// รันเฉพาะเมื่อเรียกตรง (node server.js) ไม่ใช่ตอน require ใน test
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);

    // FR-10: เริ่ม scheduler แจ้งเตือนก่อนถึงเวลาจอง
    startReminderScheduler();
  });
}
