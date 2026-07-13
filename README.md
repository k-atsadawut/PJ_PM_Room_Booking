# ระบบจองห้องผลิตสื่อดิจิทัล

**Stack:** Netlify Functions (Node.js) + Hono · MySQL (Aiven) · HTML + Tailwind CSS

---

## โครงสร้างโปรเจกต์

```
room-booking-v2/
├── netlify/
│   └── functions/
│       ├── index.js              Main API handler
│       └── reminder.js           Scheduled cron function
├── src/
│   ├── config/
│   │   └── db.js                 MySQL connection (Aiven)
│   ├── middleware/
│   │   ├── auth.js               Session/role validation
│   │   └── session.js            MySQL-based sessions
│   ├── routes/
│   │   ├── auth.js               POST /api/auth/login|logout|me|change-password
│   │   ├── bookings.js           GET|POST /api/bookings, PATCH /:id/cancel
│   │   ├── rooms.js              GET /api/rooms
│   │   ├── queues.js             Queue management
│   │   ├── maintenance.js        Maintenance reports
│   │   ├── holidays.js           Holiday management
│   │   ├── password-reset.js     Password reset requests
│   │   └── admin/
│   │       ├── bookings.js       GET|PATCH /api/admin/bookings
│   │       ├── users.js          CRUD /api/admin/users
│   │       ├── holidays.js       CRUD /api/admin/holidays
│   │       ├── reports.js        Reports
│   │       └── password-requests.js Password reset admin
│   ├── utils/
│   │   ├── password.js           bcrypt hashing
│   │   ├── mailer.js             Email sending
│   │   └── bookingRules.js       Booking validation
│   └── index.js                  Entry point
├── netlify.toml                  Netlify configuration
├── package.json
├── .env.example
└── README-NETLIFY.md             Detailed deployment guide
```

---

## วิธีติดตั้งและรัน

### 1. ติดตั้ง dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
```bash
cp .env.example .env
# แก้ไขค่าใน .env ให้ตรงกับ MySQL และ Email ของคุณ
```

**ต้องตั้งค่า:**
- `DATABASE_URL` - MySQL connection string (Aiven)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` - Email configuration

### 3. Local Development
```bash
npm install -g netlify-cli
netlify dev
```

เข้า `http://localhost:3000`

### 4. Deploy to Netlify
```bash
netlify login
netlify deploy --prod
```

หรือเชื่อมต่อ GitHub repository ใน Netlify dashboard

---

## หมายเหตุด้านความปลอดภัย

| ข้อ | FR | รายละเอียด |
|-----|----|-----------|
| รหัสผ่าน bcrypt | FR-15 | `bcrypt.hash(password, 12)` |
| ล็อกบัญชี 10 ครั้ง | FR-14 | lock 6 ชม. |
| บังคับเปลี่ยนรหัสครั้งแรก | BR-11 | `force_change_password = 1` |
| SQL Injection | FR-16 | ใช้ Prepared Statement ทุก query |
| Session Cookie | FR-19 | httpOnly + sameSite |
| Admin สร้าง User เท่านั้น | FR-17 | ไม่มีหน้าสมัครสมาชิก |
| SSL Connection | - | Aiven CA certificate verification |

---

## เอกสารเพิ่มเติม

ดู [README-NETLIFY.md](README-NETLIFY.md) สำหรับคำแนะนำการ deploy โดยละเอียด
