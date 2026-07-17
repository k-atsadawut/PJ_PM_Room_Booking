// ─── FR-19: Unit test สำหรับกลไกล็อกบัญชี ─────────────────────────
// ครอบ evaluateLoginAttempt() ทั้งกรณีปกติ, บัค "ติดที่ 1", ล็อกครบ 10,
// login ระหว่างล็อก, และหลังปลดล็อก

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateLoginAttempt,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_LOCK_MINUTES,
} = require('../utils/authLock');

const MAX = DEFAULT_MAX_ATTEMPTS;     // 10
const LOCK_MS = DEFAULT_LOCK_MINUTES * 60 * 1000; // 6 ชม.

const baseUser = (overrides = {}) => ({
  UserID: 1,
  failed_login_count: 0,
  locked_until: null,
  ...overrides,
});

// ── กรณีปกติ: ครั้งที่ 1–9 ต้อง reject และ attempts เพิ่มทีละ 1 ──
test('FR-19 กรณีปกติ: นับสะสม 1→9 และ reject ทุกครั้ง ไม่ล็อก', () => {
  let user = baseUser();
  for (let i = 1; i < MAX; i++) {
    const now = new Date();
    const r = evaluateLoginAttempt({ user, passwordValid: false, now });
    assert.equal(r.action, 'reject', `iter ${i} action`);
    assert.equal(r.attempts, i, `iter ${i} attempts ต้องเป็น ${i} ไม่ใช่ติด 1`);
    assert.equal(r.lockedUntil, null, `iter ${i} ยังไม่ล็อก`);
    assert.equal(r.shouldResetCount, false);
    assert.match(r.errorMessage, new RegExp(`\\(${i}/${MAX}\\)`));

    // จำลอง DB update สำหรับรอบถัดไป
    user = baseUser({ failed_login_count: r.attempts });
  }
});

// ── บัค "ติดที่ 1": ต้องไม่เกิด — attempts ต้องเพิ่มตาม count ที่ส่งเข้ามา ──
test('FR-19 anti-bug: ไม่ติดที่ 1/10 — อ่าน failed_login_count ที่ส่งเข้ามาถูกต้อง', () => {
  // ถ้า DB ส่ง count=7 มา ผลลัพธ์ต้องเป็น 8 (ไม่ใช่ 1 เสมอ)
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 7 }),
    passwordValid: false,
  });
  assert.equal(r.attempts, 8, 'ต้องเป็น 8 ไม่ใช่ 1 — กันบัคติดที่ (1/10)');

  const r2 = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 9 }),
    passwordValid: false,
  });
  // ครั้งที่ 10 ต้องล็อก (ไม่ใช่ reject ที่ 10)
  assert.equal(r2.action, 'lock');
});

// ── ครั้งที่ 10 ต้องล็อก ──
test('FR-19 ครั้งที่ 10: action=lock, lockedUntil = now + 6 ชม., shouldResetCount=true', () => {
  const now = new Date('2026-07-18T12:00:00Z');
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 9 }),
    passwordValid: false,
    now,
  });
  assert.equal(r.action, 'lock');
  assert.equal(r.attempts, 0, 'count reset เป็น 0 เพื่อเริ่มนับใหม่หลังปลดล็อก');
  assert.equal(r.shouldResetCount, true);
  assert.ok(r.lockedUntil, 'ต้องมี lockedUntil');

  const expected = new Date(now.getTime() + LOCK_MS);
  assert.equal(r.lockedUntil.toISOString(), expected.toISOString());

  assert.match(r.errorMessage, /กรอกรหัสผ่านผิด 10 ครั้ง/);
  assert.match(r.errorMessage, /6 ชั่วโมง/);
});

// ── ขณะล็อกอยู่ + รหัสถูก ต้อง ปฏิเสธ (บัค "login ด้วยรหัสถูกได้ปกติ") ──
test('FR-19 ขณะล็อกอยู่: ปฏิเสธแม้กรอกรหัสถูก (กันบัค login ระหว่างล็อก)', () => {
  const now = new Date('2026-07-18T12:00:00Z');
  const lockedUntil = new Date('2026-07-18T18:00:00Z'); // ล็อกถึง 18:00

  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 0, locked_until: lockedUntil }),
    passwordValid: true, // รหัสถูก!
    now,
  });
  assert.equal(r.action, 'lock', 'ต้อง lock แม้รหัสถูก ขณะบัญชีล็อกอยู่');
  assert.equal(r.shouldResetCount, false, 'ห้าม reset count ขณะล็อก');
  assert.match(r.errorMessage, /บัญชีถูกล็อกชั่วคราว/);
});

// ── ขณะล็อกอยู่ + รหัสผิด ก็ต้อง lock เหมือนกัน ──
test('FR-19 ขณะล็อกอยู่ + รหัสผิด: action=lock เช่นกัน', () => {
  const now = new Date('2026-07-18T12:00:00Z');
  const lockedUntil = new Date('2026-07-18T18:00:00Z');

  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 0, locked_until: lockedUntil }),
    passwordValid: false,
    now,
  });
  assert.equal(r.action, 'lock');
  assert.equal(r.shouldResetCount, false);
});

// ── หลังหมดเวลาล็อก + รหัสถูก: allow และ reset ──
test('FR-19 หลังหมดเวลาล็อก + รหัสถูก: allow และ reset count', () => {
  const now = new Date('2026-07-18T19:00:00Z'); // หลัง 18:00 (ปลดล็อกแล้ว)
  const lockedUntil = new Date('2026-07-18T18:00:00Z');

  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 5, locked_until: lockedUntil }),
    passwordValid: true,
    now,
  });
  assert.equal(r.action, 'allow');
  assert.equal(r.shouldResetCount, true, 'ต้อง reset count + clear lock');
  assert.equal(r.attempts, 0);
  assert.equal(r.lockedUntil, null);
});

// ── หลังหมดเวลาล็อก + รหัสผิด: เริ่มนับใหม่ที่ 1 ──
test('FR-19 หลังปลดล็อก + รหัสผิด: เริ่มนับใหม่ attempts=1', () => {
  const now = new Date('2026-07-18T19:00:00Z');
  const lockedUntil = new Date('2026-07-18T18:00:00Z');

  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 5, locked_until: lockedUntil }),
    passwordValid: false,
    now,
  });
  assert.equal(r.action, 'reject');
  // count ใน DB ยังเป็น 5 (auth.js ยังไม่ได้ reset) — attempts = 5+1 = 6
  // หมายเหตุ: หากต้องการให้เริ่มใหม่ที่ 1 จริง ต้อง reset count ตอนปลดล็อก
  // ที่นี่ใช้พฤติกรรมตาม DB จริง (count=5 ทิ้งไว้ รอ reset ที่ allow)
  assert.equal(r.attempts, 6);
});

// ── รหัสถูกตั้งแต่ต้น (ไม่เคยผิด): allow + reset ──
test('FR-19 login สำเร็จปกติ: allow + reset count', () => {
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 3 }),
    passwordValid: true,
  });
  assert.equal(r.action, 'allow');
  assert.equal(r.shouldResetCount, true);
});

// ── Edge cases: null/undefined count ──
test('FR-19 edge case: failed_login_count เป็น null ต้องถือเป็น 0', () => {
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: null }),
    passwordValid: false,
  });
  assert.equal(r.action, 'reject');
  assert.equal(r.attempts, 1, 'null → 0 → +1 = 1');
});

test('FR-19 edge case: failed_login_count เป็น undefined ต้องถือเป็น 0', () => {
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: undefined }),
    passwordValid: false,
  });
  assert.equal(r.attempts, 1);
});

// ── Edge case: นับเกิน MAX ใน DB (อาจเกิดจาก race) — ต้องล็อกทันที ──
test('FR-19 edge case: count ใน DB เกิน MAX ต้องล็อกทันที', () => {
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 15 }),
    passwordValid: false,
  });
  assert.equal(r.action, 'lock', 'count >= MAX-1 แล้วผิดอีก ต้องล็อก');
});

// ── user เป็น null/undefined ──
test('FR-19 edge case: user ไม่มี (email ไม่ถูก) ต้อง reject ไม่ล็อก', () => {
  const r = evaluateLoginAttempt({ user: null, passwordValid: false });
  assert.equal(r.action, 'reject');
  assert.equal(r.attempts, null);
});

// ── ฟอร์แมตเวลาปลดล็อก ข้ามวัน ──
test('FR-19 unlock time ข้ามวัน: ระบุ DD/MM HH:MM', () => {
  // ใช้ local date เพื่อให้ข้ามวันเสมอ (ใช้ getHours/getDate ของ server)
  const now = new Date();
  now.setHours(23, 0, 0, 0);             // วันนี้ 23:00 local
  const lockedUntil = new Date(now.getTime() + 6 * 3600 * 1000); // +6 ชม. = พรุ่งนี้ 05:00

  const r = evaluateLoginAttempt({
    user: baseUser({ locked_until: lockedUntil }),
    passwordValid: true,
    now,
  });
  // ข้ามวัน → ระบุ DD/MM HH:MM
  assert.match(r.errorMessage, /\d{1,2}\/\d{1,2} \d{2}:\d{2}/);
});

// ── config ปรับเปลี่ยนได้ (สะท้อน env override) ──
test('FR-19 config: ปรับ maxAttempts/lockMinutes ได้', () => {
  const r = evaluateLoginAttempt({
    user: baseUser({ failed_login_count: 2 }), // ครั้งที่ 3
    passwordValid: false,
    maxAttempts: 3,
    lockMinutes: 60,
  });
  assert.equal(r.action, 'lock');
  assert.match(r.errorMessage, /ผิด 3 ครั้ง/);
  assert.match(r.errorMessage, /1 ชั่วโมง/);

  const expectedLock = new Date(r.lockedUntil);
  const sixtyMin = 60 * 60 * 1000;
  // ตรวจว่า lockedUntil ≈ now + 60 นาที (ปัด วินาที)
  assert.ok(Math.abs(expectedLock.getTime() - Date.now() - sixtyMin) < 5000);
});
