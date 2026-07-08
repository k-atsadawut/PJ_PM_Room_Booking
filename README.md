# ระบบจองห้องผลิตสื่อดิจิทัล

**Stack:** React + Tailwind CSS (CDN) · Node.js + Express · MySQL

---

## โครงสร้างโปรเจกต์

```
room-booking/
├── backend/
│   ├── config/db.js              MySQL connection pool
│   ├── middleware/auth.js        ตรวจสอบ session / role
│   ├── routes/
│   │   ├── auth.js               POST /api/auth/login|logout|me|change-password
│   │   ├── bookings.js           GET|POST /api/bookings, PATCH /:id/cancel
│   │   ├── rooms.js              GET /api/rooms
│   │   └── admin/
│   │       ├── bookings.js       GET|PATCH /api/admin/bookings (อนุมัติ/ปฏิเสธ)
│   │       ├── users.js          CRUD /api/admin/users
│   │       └── holidays.js       CRUD /api/admin/holidays
│   ├── server.js                 Entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── login.html                หน้าเข้าสู่ระบบ
│   ├── dashboard.html            ประวัติการจอง (Student/Teacher)
│   ├── booking.html              จองห้อง
│   ├── change-password.html      เปลี่ยนรหัสผ่าน (FR-19)
│   ├── admin/
│   │   └── dashboard.html        Admin (อนุมัติ / ผู้ใช้ / วันหยุด)
│   └── assets/js/api.js          Shared fetch helper
│
└── database/
    └── schema.sql                MySQL CREATE TABLE
```

---

## วิธีติดตั้ง

### 1. สร้างฐานข้อมูล
```sql
-- รันใน phpMyAdmin หรือ MySQL CLI
SOURCE database/schema.sql;
```

### 2. ตั้งค่า Backend
```bash
cd backend
cp .env.example .env
# แก้ไขค่าใน .env ให้ตรงกับ MySQL ของคุณ

npm install
npm run dev      # พัฒนา (nodemon)
# หรือ
npm start        # production
```

### 3. เปิดเว็บ
เข้า `http://localhost:3000` — Express จะ serve ไฟล์ HTML ใน /frontend ให้อัตโนมัติ

---

## หมายเหตุด้านความปลอดภัย

| ข้อ | FR | รายละเอียด |
|-----|----|-----------|
| รหัสผ่าน bcrypt | FR-15 | `bcrypt.hash(password, 12)` |
| ล็อกบัญชี 10 ครั้ง | FR-14 | lock 6 ชม. (ตั้งค่าได้ใน .env) |
| บังคับเปลี่ยนรหัสครั้งแรก | BR-11 | `force_change_password = 1` |
| SQL Injection | FR-16 | ใช้ Prepared Statement ทุก query |
| Session Cookie | FR-19 | httpOnly + sameSite |
| Admin สร้าง User เท่านั้น | FR-17 | ไม่มีหน้าสมัครสมาชิก |
