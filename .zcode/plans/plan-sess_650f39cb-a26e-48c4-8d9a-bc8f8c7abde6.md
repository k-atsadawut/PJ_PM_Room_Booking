# แผนการแก้บัค FR-19 (ล็อกบัญชีหลังผิด 10 ครั้ง) + เพิ่ม Holiday Popup + รัน Test Case

## บริบทที่ตรวจพบ
หลังตรวจสอบแล้ว พบว่า:
- DB schema ถูกต้อง (`failed_login_count`, `locked_until` มีอยู่จริง ไม่มี trigger reset)
- **logic ใน auth.js ทำงานถูกต้อง** เมื่อ replay ตรงกับ DB: `1→2→...→10→LOCKED`
- แต่บัคเกิดซ้ำในการใช้งานจริง เพราะ logic ฝังใน route handler ทั้ง 2 ชุด (Express + Hono) ไม่มี test คุ้ม และ config ไม่ sync
- มี code ซ้ำซ้อน 3 ที่ที่ต้อง sync ให้ตรง (Express `backend/routes/auth.js`, Hono `src/routes/auth.js`, Netlify reuses Hono)

## สิ่งที่จะทำ

### ส่วนที่ 1: แก้บัค FR-19 (ล็อกบัญชี) — Refactor + Test

**1.1 สร้าง `backend/utils/authLock.js`** (pure function ที่ทดสอบได้)
- `evaluateLoginAttempt({ user, passwordValid, now, maxAttempts, lockMinutes })` → คืน `{ action: 'allow' | 'reject' | 'lock', attempts, lockedUntil, errorMessage }`
- Pure function ไม่ touch DB ไม่ touch req/res — ทดสอบง่ายและ deterministic
- ฝั่ง Hono สร้าง `src/utils/authLock.js` (CommonJS ↔ ESM mirror) เหมือนกัน เพื่อให้ทั้ง Express และ Hono ใช้ logic ชุดเดียวกันทาง concept (sync ด้วย test)

**1.2 แก้ `backend/routes/auth.js`** (Express)
- ดึง logic ออกเรียก `evaluateLoginAttempt()` แทนการคำนวณ inline
- อ่าน `MAX_LOGIN_ATTEMPTS` / `LOGIN_LOCK_MINUTES` จาก `process.env` (มีอยู่แล้ว)
- แก้ lock-check ให้ใช้ ISO string ใน error message (หลีกก locale-dependent `toLocaleTimeString`)
- แก้ race: เพิ่ม `WHERE failed_login_count = ?` guard ใน UPDATE เพื่อกัน lost-update ถ้ามี request ซ้อนทับ

**1.3 แก้ `src/routes/auth.js`** (Hono — Cloudflare/Netlify)
- อ่าน `c.env.MAX_LOGIN_ATTEMPTS` / `c.env.LOGIN_LOCK_MINUTES` (จาก wrangler.toml `[vars]`) แทน hardcode `10`/`360`
- ใช้ logic เดียวกันกับ Express

**1.4 sync `wrangler.toml`** ให้ตรงกับ spec FR-19: `MAX_LOGIN_ATTEMPTS = "10"`, `LOGIN_LOCK_MINUTES = "360"` (ตอนนี้ตั้ง `5`/`30` ซึ่งผิด spec)

### ส่วนที่ 2: เพิ่ม Unit Test (FR-19) — `backend/tests/auth-lock.test.js`
ใช้ `node:test` ตาม pattern ที่มีอยู่ ครอบกรณี:
- ✅ ครั้งที่ 1–9: `action: 'reject'`, attempts เพิ่มทีละ 1, ไม่ล็อก
- ✅ ครั้งที่ 10: `action: 'lock'`, `lockedUntil` ตั้งไว้ +6 ชม.
- ✅ ขณะล็อกอยู่ + ใส่รหัสถูก: `action: 'lock'` (ปฏิเสธแม้รหัสถูก) — ตรงกับรายงานบัค "ยัง login ด้วยรหัสถูกได้ปกติ"
- ✅ หลังหมดเวลาล็อก + รหัสถูก: `action: 'allow'` และ reset count
- ✅ ทดสอบสมมติฐาน "ติดที่ 1" — ยืนยันว่า function คืน attempts ที่ถูกต้องเสมอ ไม่ติดที่ 1
- ✅ edge cases: count เป็น null/undefined, attempts เกิน MAX_ATTEMPTS

### ส่วนที่ 3: Integration Test (HTTP) — `backend/tests/auth-lock.integration.test.js`
- สร้าง user ทดสอบใน DB → ยิง HTTP `POST /api/auth/login` ผิด ๆ ผ่าน Express server (รันบน port ทดสอบ) → ตรวจ response และ DB state
- ทดสอบ 10 ครั้งจริง และยืนยัน lock จริง + unlock หลัง 6 ชม. (mock time)
- **ระวัง**: test นี้จะแตะ DB จริง จะใช้ user ทดสอบเฉพาะ (`test_lock_X@...`) และ cleanup ท้าย test

### ส่วนที่ 4: เพิ่ม Holiday Popup หลัง Login
*หมายเหตุ: ตรวจพบว่า holiday popup มีอยู่แล้วบางส่วนใน `frontend/dashboard.html` (บรรทัด 277–440) ทำงานคู่กับ `sessionStorage.showHolidayPopup` ที่ set ใน `login.html:99`*

- ตรวจสอบ popup ที่มี ว่าทำงานครบไหม ถ้ามีปัญหาก็แก้
- ทำให้แสดง **วันหยุดที่กำลังจะถึง** (upcoming holidays) นอกเหนือจาก "วันนี้เป็นวันหยุด"
- ทำให้ popup แสดง **1 ครั้งต่อ session** (ไม่รบกวนทุกครั้งที่กลับมา dashboard) — ใช้ sessionStorage ที่มี
- ตรงประเด็น test case FR-05 (สกัดกั้นวันหยุด) และ FR-16 (จัดการปฏิทินแอดมิน) ในไฟล์ Excel

### ส่วนที่ 5: รัน Test Case จาก Excel
- รัน test ที่เขียน (unit + integration) สำหรับ **FR-19** (ล็อกบัญชี) ซึ่งเป็นเป้าหมายหลักของบัคนี้
- รายงานผลเป็นตาราง ระบุ Pass/Fail ต่อ test condition ในไฟล์ Excel
- หากต้องการครอบคลุม FR อื่นใน Excel (FR-01 ถึง FR-22) จะแยกเป็นงานติดตาม เพราะแต่ละ FR มีขอบเขตกว้าง (คิว, อีเมล, real-time, QR ฯลฯ)

## ไฟล์ที่จะแก้ไข/สร้าง
- 🆕 `backend/utils/authLock.js` — pure function FR-19
- 🆕 `src/utils/authLock.js` — mirror สำหรับ Hono (ESM)
- ✏️ `backend/routes/auth.js` — เรียกใช้ authLock + env config + race guard
- ✏️ `src/routes/auth.js` — เรียกใช้ authLock + อ่าน c.env
- ✏️ `wrangler.toml` — sync MAX_LOGIN_ATTEMPTS=10, LOGIN_LOCK_MINUTES=360
- 🆕 `backend/tests/auth-lock.test.js` — unit tests
- 🆕 `backend/tests/auth-lock.integration.test.js` — HTTP integration tests
- ✏️ `frontend/dashboard.html` — ตรวจ/แก้ holiday popup (ส่วนที่ 4)
- 🆕 `backend/package.json` — เพิ่ม `"test": "node --test tests/"`

## ความเสี่ยง
- Integration test จะแตะ DB production (TiDB Cloud) จะใช้ user ทดสอบเฉพาะและ cleanup
- การแก้ `src/routes/auth.js` อาจกระทบ Netlify/Cloudflare deployment ต้องทดสอบ logic ครบก่อน
- Holiday popup มีอยู่แล้ว ต้องระวังไม่ break ของเดิม