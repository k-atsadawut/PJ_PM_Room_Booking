# แผน: ยก UX/visual จาก mockup ไปลง HTML จริง (ทั้ง 7 ไฟล์) + เชื่อม API จริง

## หลักการสำคัญ (จากคำตอบของคุณ)
- **ไม่**ลง shadcn semantic token ใหม่ — ใช้ token เดิม (`primary-*` ramp + raw Tailwind + `.dark` overrides ใน `tokens.css`)
- ปรับ layout/spacing/badge/card style ตามสไตล์ mockup (rounded-2xl, soft pastel badge, gradient logo, dot-grid bg, ฯลฯ) **โดยใช้ raw Tailwind class**
- ทำครบทุกหน้าพร้อมกัน: `login`, `dashboard`, `booking`, `maintenance`, `change-password`, `forgot-password`, `admin/dashboard`
- เชื่อม API จริงทุก flow + ฟีเจอร์ที่ขาด (queue, notifications, QR, forgot/change pw) + admin tabs ครบ + auto-approve + สถานะ cancelled

---

## ข้อตกลงเบื้องต้นที่ตรวจแล้วจากโค้ดจริง
- API casing เป็น **PascalCase ผสม** (เช่น `RoomID`, `BookingDate`, `StartTime`, `Status`, `UserName`) ยกเว้น `availability` และ `me` ที่ camelCase
- Backend (src/) mount ครบแล้ว: `/api/notifications`, `/api/admin/notify`, `/api/admin/reports/summary` — **ไม่ใช่ 404 ตามที่ agent เฝือนจาก backend/**
- `PATCH /api/admin/bookings/:id` ไม่มีใน src/ (auto-approve) → ต้องลบ UI approve/reject ใน admin dashboard ออก
- mockup ใช้ shadcn class ที่ไม่มีในระบบ → จะ map เป็น raw Tailwind (เช่น `bg-card`→`bg-white dark:bg-slate-800`, `text-foreground`→`text-gray-800 dark:text-gray-100`, `bg-muted`→`bg-slate-100 dark:bg-slate-700/50`, `border-border`→`border-slate-200 dark:border-slate-700`, `bg-primary`→`bg-blue-600`, `text-muted-foreground`→`text-gray-500`, `bg-input-background`→`bg-gray-50 dark:bg-slate-900`)

---

## Phase 1 — Shared visual foundation (1 ไฟล์)

**`frontend/styles/tokens.css`** — เพิ่ม utility class ร่วมแบบไม่กระทบของเดิม:
- `.app-bg` (dot-grid background สำหรับ login และ auth pages)
- `.app-logo-gradient` (gradient `linear-gradient(135deg, #2563eb, #4f46e5)`)
- `.app-btn-primary` (gradient `135deg, #2563eb, #1d4ed8` + hover/active)
- `.app-card` (rounded-2xl + border-slate-200 + shadow-sm + dark override อัตโนมัติผ่าน `.dark .bg-white` ที่มีอยู่แล้ว)
- `.app-badge-*` (soft pastel badges: green/yellow/red/gray)
- คง dark override block เดิมไว้ทั้งหมด (ใช้ต่อไป)

**ไม่**สร้าง `ui.js` แยก (ไม่มี build step, แต่ละไฟล์จะ inline snippet เล็กน้อยเอง)

---

## Phase 2 — `frontend/login.html` (เดิม 310 บรรทัด)

| ปรับอะไร | รายละเอียด |
|---|---|
| Visual ตาม mockup | dot-grid bg, gradient logo 16×16 (drop-shadow), glass card, label + input แบบมี icon ซ้าย, gradient submit |
| ลบ bug | `setHoliday` undefined → เพิ่ม state `holiday` + ใช้สำหรับแสดง popup ถ้ามี |
| ลบ dead code | left branding panel `hidden`, `gradient-bg` class ที่ไม่ได้ใช้ |
| เชื่อมจริง | `/api/auth/login` (มีอยู่แล้ว ✓), redirect admin → `/admin/dashboard.html`, อื่น → `/dashboard.html` |
| ลิงก์ forgot | `forgot-password.html` ที่ใช้งานได้ |
| Holiday popup | ดึง `/api/holidays/today` แล้วแสดง modal แบบ mockup |

---

## Phase 3 — `frontend/dashboard.html` (เดิม 930 บรรทัด)

| ปรับอะไร | รายละเอียด |
|---|---|
| Visual ตาม mockup | สวัสดี/ชื่อ, StatsCard แบบ icon + value + label, RoomCard แบบ icon + status badge + capacity + book button, booking table แบบ mockup |
| เพิ่ม Notifications bell | ใน Navbar: `GET /api/notifications/unread-count` poll ทุก 30s + badge + dropdown/modal `GET /api/notifications`, `PATCH /:id/read`, `PATCH /read-all` |
| แก้ stat "แจ้งเตือน=0" | ผูกกับ unread-count จริง |
| เพิ่ม Queue section | `GET /api/queues` แสดงรายการที่รอ + ปุ่ม "ออกจากคิว" `DELETE /api/queues/:id` |
| คงไว้ | QR code modal (ใช้งานได้แล้ว), maintenance list (ใช้งานได้แล้ว), holiday popup |
| สถานะ booking | เพิ่ม badge `cancelled` ในตาราง (มีใน STATUS_LABEL แล้ว) |
| ปุ่มยกเลิก | คงไว้ ใช้ `PATCH /api/bookings/:id/cancel` |
| ลบ dead class | `bg-gray-150`, `border-current/20` |

---

## Phase 4 — `frontend/booking.html` (เดิม 338 บรรทัด)

| ปรับอะไร | รายละเอียด |
|---|---|
| Visual ตาม mockup | section label + icon, time slot dropdown แบบ `XX:XX น.`, room picker เป็นการ์ดเลือกได้ |
| Auto-approve | success message บอก "จองสำเร็จ (อนุมัติอัตโนมัติ)" |
| ลบ "pending" UI | ระบบจริง approved ทันที ไม่มี pending |
| รองรับ `?roomId=` | deep-link จาก QR |
| ตรวจนาที | เพิ่ม client-side validation `end > start` ก่อน submit |

---

## Phase 5 — `frontend/maintenance.html` (เดิม 272 บรรทัด)

| ปรับอะไร | รายละเอียด |
|---|---|
| Visual ตาม mockup | card แบบ mockup, status badge สไตล์เดียวกัน |
| รองรับ `?roomId=` | pre-fill room จาก QR scan |
| สถานะครบ | pending / in_progress / completed / rejected badge |
| ใช้ `requireLogin` | แทน hand-rolled auth guard (ให้ตรงกับ dashboard) |

---

## Phase 6 — `frontend/change-password.html` (เดิม 155 บรรทัด)

| ปรับอะไร | รายละเอียด |
|---|---|
| Visual ตาม mockup | card แบบ mockup (ไม่ใช่จัดกลางจอ + ฟิลด์เรียงแนวตั้ง) |
| ลบ `console.log` | ลบ debug statement |
| คง force-change | เมื่อ `forceChangePassword` ซ่อน current password field |

---

## Phase 7 — `frontend/forgot-password.html` (เดิม 213 บรรทัด)

| ปรับอะไร | รายละเอียด |
|---|---|
| Visual ตาม mockup | ลดความซับซ้อน double-center |
| คง 4-step state | `email → sent → reset → done` |
| คง `?resetToken=` | กระโดดได้ |
| เพิ่ม email format validation | regex |

---

## Phase 8 — `frontend/admin/dashboard.html` (เดิม 2149 บรรทัด — ใหญ่ที่สุด)

| ปรับอะไร | รายละเอียด |
|---|---|
| **Sidebar nav → tabs** | 7 tabs ตามระบบจริง: bookings, rooms, users, holidays, password-requests, maintenance, notify (ลบ dead "reports" tab ถ้ามี — reports จะรวมในแต่ละ tab) |
| **ลบ approve/reject booking** | auto-approve → แทนที่ด้วย view-only bookings table + filter status |
| **Notification bell ย้ายไป Navbar** | ปัจจุบันอยู่ใน BookingsTab → ย้ายขึ้นไป navbar ระดับแอป, poll unread-count |
| **Reports** | `GET /api/admin/reports/summary` แสดงเป็น StatsCard ด้านบน BookingsTab (อัตราอนุมัติ 100%, จองทั้งหมด, รออนุมัติ 0 — ตามความเป็นจริง) |
| **แท็บ Maintenance** | ใช้ `GET /api/maintenance/admin` + `PATCH /api/maintenance/:id` |
| **แท็บ Password Requests** | `GET` + `PATCH /:id/approve`, `PATCH /:id/reject` (ปัจจุบันมีแค่ GET → เพิ่ม action) |
| **แท็บ Notify** | `POST /api/admin/notify/send` body `{ to, subject, body }` |
| **ลบ endpoint ผิด** | `PATCH /api/rooms/:id` มีอยู่จริงใน src/ ✓ — คงไว้; `PATCH /api/admin/bookings/:id` ไม่มี → ลบ |
| Visual | ทุกตาราง/การ์ด/modal ใช้สไตล์ mockup (rounded-2xl, soft badge, gradient button, consistent spacing) |
| คง countdown timer | "นับถึงรอบรายงานถัดไป" ใน navbar |

---

## ลำดับการทำ + การตรวจสอบ

1. **Phase 1** (tokens.css) — ทำก่อน, เปิดเทียบกับหน้าเดิมดูว่าไม่ break
2. **Phase 2-7** (6 หน้า user-facing) — ทำทีละไฟล์, แต่ละไฟล์เสร็จ → เช็คว่า React mount ได้ ไม่มี syntax error
3. **Phase 8** (admin dashboard) — ทำเป็นช่วง ๆ (Navbar → แต่ละ tab), เพราะใหญ่ที่สุด

ในแต่ละไฟล์จะ:
- อ่านไฟล์เดิมทั้งหมดก่อน
- ใช้ `Write` แทนที่ทั้งไฟล์ (เพราะปรับ layout ไม่ใช่ patch)
- รักษา API call logic เดิมที่ทำงานอยู่แล้ว

---

## สิ่งที่**ไม่**ทำ (เพื่อไม่ให้ขอบเขตบาน)
- ไม่ลง shadcn/Radix/Headless UI
- ไม่เพิ่ม build step (Vite/webpack)
- ไม่แตะ backend routes ใน `src/`
- ไม่แก้ password hashing (SHA-256 demo-grade) — เป็นข้อจำกัดที่ทราบ
- ไม่ refactor `api.js` / `theme.js` (ทำงานได้ดีแล้ว)

---

## หมายเหตุที่ทราบและจะแจ้งระหว่างทำ
- mockup login เป็น hardcoded role (ดูคำว่า admin/teacher) → จะใช้ `/api/auth/login` จริงแทน
- mockup admin bookings มี pending/approve → จะลบออกเพราะระบบจริง auto-approve
- mockup ไม่มี queue/notifications inbox/maintenance/QR/reports → จะเพิ่มเข้าไปใน HTML จริง

พร้อมเริ่มทันทีหลังอนุมัติ จะเริ่มจาก Phase 1 (tokens.css) ก่อนครับ