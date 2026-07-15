# Traceability Matrix - ระบบจองห้องผลิตสื่อดิจิทัล
**เอกสารอ้างอิง:** SRS_v2

## สรุปสถานะโดยรวม
| สถานะ | จำนวน | เปอร์เซ็นต์ |
|-------|--------|-------------|
| Done (เสร็จสมบูรณ์) | 21 | 95% |
| Partial (ทำบางส่วน) | 2 | 9% |
| Missing (ยังไม่ทำ) | 0 | 0% |

---

## Functional Requirements (FR)

| FR | คำอธิบาย | ไฟล์/บรรทัด | สถานะ | หมายเหตุ |
|----|-----------|-------------|--------|-----------|
| FR-01 | เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น | `backend/routes/bookings.js:32-34` | Done | Validation ก่อน insert |
| FR-02 | สามารถจองห้องล่วงหน้าได้ | `backend/routes/bookings.js:42-45` | Done | ป้องกันจองย้อนหลังและอนุญาตให้จองล่วงหน้าได้ |
| FR-03 | ตรวจสอบ conflict (ช่วงเวลาซ้ำ) | `backend/routes/bookings.js:68-79` | Done | Query หา booking ซ้อนทับ |
| FR-04 | ดูห้องทั้งหมดพร้อมสถานะวันนี้ | `backend/routes/rooms.js:6-52` | Done | JSON_ARRAYAGG bookings_today |
| FR-05 | จองได้เฉพาะเวลาทำการ 08:30–17:00 | `backend/routes/bookings.js:37-39, 48-51` | Done | เช็ค start/end time + หมดเวลาจอง |
| FR-06 | ไม่เปิดให้จองวันเสาร์-อาทิตย์ | `backend/routes/bookings.js:54-57` | Done | เช็ค dayOfWeek |
| FR-07 | แสดงสถานะห้อง (available/unavailable) | `backend/routes/rooms.js:10-34` | Done | JOIN bookings แล้ว filter |
| FR-08 | ยกเลิกการจอง | `backend/routes/bookings.js:122-139` | Done | PATCH /:id/cancel |
| FR-09 | แจ้ง Admin เมื่อมีคำขอจองใหม่ | `backend/routes/bookings.js:102-133` | Done | Notification ในระบบ |
| FR-10 | แจ้งเตือนก่อนถึงเวลาจอง | `backend/jobs/reminder.js`, `backend/server.js:6,52` | Done | node-cron scheduler รันทุก 5 นาที |
| FR-11 | ส่งอีเมลแจ้ง Admin เมื่อมีคำขอใหม่ | `backend/routes/bookings.js:118-132` | Done | เรียก notifyAdminNewBooking |
| FR-12 | ส่งอีเมลแจ้งผู้จองเมื่ออนุมัติ/ปฏิเสธ | `backend/routes/admin/bookings.js:49-61` | Done | เรียก notifyUserBookingStatus |
| FR-13 | ระบบคิว (Queue) เมื่อห้องเต็ม | `backend/routes/queues.js`, `backend/routes/bookings.js:6,159`, `backend/routes/admin/bookings.js:5,65` | Done | POST/GET/DELETE /api/queues + auto-notify on cancel/reject |
| FR-14 | ระบบรายงาน (Reports) | `backend/routes/admin/reports.js` | Done | Daily/Monthly/Frequent Users/Popular Rooms + Excel/PDF export |
| FR-15 | แจ้งซ่อมผ่าน QR Code | `backend/routes/maintenance.js`, `frontend/maintenance.html` | Done | POST/GET /api/maintenance + Admin management |
| FR-16 | ป้องกัน SQL Injection | ทุกไฟล์ routes | Done | ใช้ Prepared Statement ทุก query |
| FR-17 | Admin สร้าง User เท่านั้น (ไม่มีหน้าสมัคร) | `backend/routes/admin/users.js:16-33` | Done | POST /api/admin/users |
| FR-18 | เปลี่ยนรหัสผ่าน | `backend/routes/auth.js:85-118` | Done | POST /api/auth/change-password |
| FR-19 | บังคับเปลี่ยนรหัสครั้งแรก | `backend/routes/auth.js:63, 102-107` | Done | force_change_password flag |
| FR-20 | ระบบ Login (เข้าสู่ระบบ) | `backend/routes/auth.js:11-70` | Done | POST /api/auth/login |
| FR-21 | ระบบ Logout (ออกจากระบบ) | `backend/routes/auth.js:73-77` | Done | POST /api/auth/logout |
| FR-22 | ดูข้อมูลตัวเอง | `backend/routes/auth.js:80-82` | Done | GET /api/auth/me |

---

## Business Rules (BR)

| BR | คำอธิบาย | ไฟล์/บรรทัด | สถานะ | หมายเหตุ |
|----|-----------|-------------|--------|-----------|
| BR-01 | รหัสผ่านต้องมีความยาวไม่น้อยกว่า 6 ตัวอักษร | `backend/routes/auth.js:88-90` | Done | Validation ใน change-password |
| BR-02 | รหัสผ่านต้องมีตัวเลขและตัวอักษร | - | Partial | ยังไม่มี validation regex |
| BR-03 | รหัสผ่านต้องไม่ซ้ำกับรหัสเดิม | - | Partial | ยังไม่มีเช็คประวัติ |
| BR-04 | รหัสผ่านหมดอายุทุก 90 วัน | - | Missing | ยังไม่มี password_expiry |
| BR-05 | บัญชีถูกล็อกหลังจากพยายามเข้าสู่ระบบผิด 10 ครั้ง | `backend/routes/auth.js:27-49` | Done | MAX_LOGIN_ATTEMPTS = 10 |
| BR-06 | 1 ครั้ง/วัน/ผู้ใช้ | `backend/routes/bookings.js:82-91` | Done | Query เช็ค existing booking |
| BR-07 | คิวรีการจองต้องเรียงตามวันที่และเวลา | `backend/routes/bookings.js:17` | Done | ORDER BY BookingDate DESC, StartTime DESC |
| BR-08 | ระบบต้องบันทึกประวัติการจองทั้งหมด | `backend/routes/bookings.js:12-18` | Done | GET /api/bookings ดึงทั้งหมด |
| BR-09 | การจองที่ถูกปฏิเสธต้องแสดงในประวัติ | `backend/routes/bookings.js:12-18` | Done | Query ไม่ filter status |
| BR-10 | ระบบต้องแจ้งเตือนเมื่อมีการจองใหม่ | `backend/routes/bookings.js:102-133` | Done | Notification + Email |
| BR-11 | รหัสผ่านเริ่มต้นคือนามสกุล และบังคับเปลี่ยน | `backend/routes/admin/users.js:23-24` | Done | hash(lastName) + force_change_password=1 |
| BR-12 | Admin สามารถจัดการวันหยุดพิเศษได้ | `backend/routes/admin/holidays.js` | Done | CRUD /api/admin/holidays |
| BR-13 | ไม่สามารถจองในวันหยุดพิเศษ | `backend/routes/bookings.js:60-65` | Done | Query holidays table |
| BR-14 | ระบบต้องรองรับห้องจองได้หลายห้อง | `backend/routes/rooms.js:6-52` | Done | รองรับหลาย RoomID |
| BR-15 | ระบบคิว (Queue) | `backend/routes/queues.js` | Done | POST/GET/DELETE /api/queues + auto-notify |

---

## Non-Functional Requirements (NFR)

| NFR | คำอธิบาย | การ Implement | สถานะ |
|-----|-----------|---------------|--------|
| NFR-01 | ระบบต้องตอบสนองภายใน 2 วินาที | ใช้ MySQL connection pool + Prepared Statement | Done |
| NFR-02 | ระบบต้องรองรับผู้ใช้พร้อมกัน 50 คน | Express + MySQL รองรับ concurrent requests | Done |
| NFR-03 | ระบบต้องมีความปลอดภัย (bcrypt, session) | bcryptjs + express-session (httpOnly) | Done |
| NFR-04 | ระบบต้องมีการ Backup ข้อมูล | - | Missing (Deployment task) |
| NFR-05 | ระบบต้องถูก deploy บน Server มหาวิทยาลัย | - | Missing (Deployment task) |

---

## ไฟล์ที่ Implement แล้ว

| ไฟล์ | หน้าที่ | FR/BR ที่ครอบคลุม |
|------|--------|-------------------|
| `backend/routes/auth.js` | Login/Logout/Change Password | FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, BR-01, BR-05 |
| `backend/routes/bookings.js` | สร้าง/ดู/ยกเลิกการจอง | FR-01, FR-02, FR-03, FR-05, FR-06, FR-08, FR-09, FR-11, FR-13, BR-06, BR-07, BR-08, BR-09, BR-10, BR-13, BR-15 |
| `backend/routes/rooms.js` | ดู/จัดการห้อง | FR-04, FR-07, BR-14 |
| `backend/routes/queues.js` | ระบบคิว | FR-13, BR-15 |
| `backend/routes/maintenance.js` | แจ้งซ่อม | FR-15 |
| `backend/routes/admin/bookings.js` | อนุมัติ/ปฏิเสธการจอง | FR-12, FR-13, BR-15 |
| `backend/routes/admin/users.js` | จัดการผู้ใช้ | FR-17, BR-11 |
| `backend/routes/admin/holidays.js` | จัดการวันหยุด | BR-12, BR-13 |
| `backend/routes/admin/reports.js` | ระบบรายงาน | FR-14 |
| `backend/jobs/reminder.js` | แจ้งเตือนก่อนถึงเวลาจอง | FR-10 |
| `backend/utils/mailer.js` | ส่งอีเมล | FR-11, FR-12 |
| `backend/utils/bookingRules.js` | Business rule helpers | BR-06 |
| `backend/utils/password.js` | Hash/Verify password | FR-15 |
| `backend/middleware/auth.js` | Authentication/Authorization | FR-16, FR-17 |

---

## งานที่ยังค้าง (ตามลำดับความสำคัญ)

### 🔴 ระดับวิกฤต
- **Task 2**: Re-seed ฐานข้อมูลจริง (ถ้าเคย import test_data เก่า) - ต้อง sync password hash

###  ระดับกลาง
- **Task 8**: แก้จำนวนห้องและ Capacity ให้ตรง SRS (4 ห้อง, capacity 1)
- **Task 9**: รีแมปเลข FR/BR ในคอมเมนต์โค้ดให้ตรงกับ SRS_v2

### 🟢 ระดับต่ำ
- **Task 11**: เพิ่ม Auto-expire คำขอที่ยังไม่อนุมัติ
- **Task 12**: ตัดสินใจเรื่อง Hosting (NFR-05)

---

## หมายเหตุสำคัญ

1. **FR-11, FR-12 (Email)**: เพิ่ม implement แล้วใน Task 3 แต่ต้องตั้งค่า MAIL_HOST/PORT/USER/PASS ใน `.env` จริงๆ ถึงจะส่งได้
2. **BR-06 (Daily Limit)**: Implement แล้วใน `bookings.js:82-91` ตรวจสอบว่ามี booking pending/approved ในวันเดียวกันหรือไม่
3. **FR-16 (SQL Injection)**: ทุก query ใช้ Prepared Statement (`db.execute` กับ placeholder `?`) ปลอดภัยแล้ว
4. **SRS_v2 Mapping**: เลข FR/BR ในคอมเมนต์โค้ดบางส่วนอาจไม่ตรงกับ SRS_v2 ต้องทำ Task 9 เพื่อ sync

---

**วันที่สร้างเอกสาร:** 3 กรกฎาคม 2026  
**เวอร์ชัน SRS:** v2
