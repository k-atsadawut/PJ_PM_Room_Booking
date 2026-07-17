// ─── FR-19: Integration test (HTTP end-to-end) ────────────────────
// Boot Express app บน port ทดสอบ แล้วยิง HTTP ผ่าน /api/auth/login
// ใช้ user ทดสอบเฉพาะ (test_lock_*@...) ใน DB และ cleanup ท้าย test
//
// รัน:  node --test tests/auth-lock.integration.test.js
// ต้องมี: process.env.DB_* (TiDB/Aiven) ใน .env ที่ root

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');

// โหลด .env ที่ root ก่อน require app
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// กัน scheduler ทำงานตอน require app
process.env.SKIP_SCHEDULER = '1';

const db = require('../config/db');
const { hashPassword } = require('../utils/password');

const TEST_PORT = parseInt(process.env.FR19_TEST_PORT) || 3999;
const TEST_EMAIL = 'test_lock_user@test.local';
const TEST_PASSWORD = 'TestLock!2026';
const BASE = `http://127.0.0.1:${TEST_PORT}`;

let httpServer;
let testUserId;

function loginRequest(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const req = http.request(
      `${BASE}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let data = {};
          try { data = JSON.parse(chunks || '{}'); } catch {}
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

test.before(async () => {
  // Boot Express app บน port ทดสอบ
  const app = require('../server');
  await new Promise((resolve) => {
    httpServer = app.listen(TEST_PORT, resolve);
  });

  // สร้าง/รีเซ็ต user ทดสอบ
  const hashed = await hashPassword(TEST_PASSWORD);
  const [existing] = await db.execute(
    'SELECT UserID FROM users WHERE Email = ? LIMIT 1',
    [TEST_EMAIL]
  );
  if (existing.length > 0) {
    testUserId = existing[0].UserID;
    await db.execute(
      'UPDATE users SET Password = ?, failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
      [hashed, testUserId]
    );
  } else {
    const [r] = await db.execute(
      "INSERT INTO users (Name, Email, Password, Role, force_change_password, failed_login_count) VALUES (?, ?, ?, 'student', 0, 0)",
      ['Test Lock User', TEST_EMAIL, hashed]
    );
    testUserId = r.insertId;
  }
});

test.after(async () => {
  if (httpServer) {
    await new Promise((r) => httpServer.close(r));
  }
  if (testUserId) {
    await db.execute('DELETE FROM users WHERE UserID = ?', [testUserId]);
  }
  // ปิด mysql pool เพื่อให้ node ออก
  try { await db.end(); } catch {}
});

// ── Test 1: login ผิด 9 ครั้ง ต้องขึ้น (n/10) ถูกต้อง ไม่ติดที่ 1 ──
test('FR-19 HTTP: นับสะสม 1→9 ถูกต้อง (กันบัคติดที่ 1)', { timeout: 60000 }, async () => {
  await db.execute(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
    [testUserId]
  );

  for (let i = 1; i <= 9; i++) {
    const r = await loginRequest(TEST_EMAIL, 'wrong-password');
    assert.equal(r.status, 401, `iter ${i} ต้องเป็น 401`);
    assert.match(
      r.data.error,
      new RegExp(`\\(${i}/10\\)`),
      `iter ${i} ต้องขึ้น (${i}/10) ไม่ใช่ (1/10) — พบ: "${r.data.error}"`
    );
  }

  const [rows] = await db.execute(
    'SELECT failed_login_count, locked_until FROM users WHERE UserID = ?',
    [testUserId]
  );
  assert.equal(rows[0].failed_login_count, 9);
  assert.equal(rows[0].locked_until, null);
});

// ── Test 2: ครั้งที่ 10 → ล็อก ──
test('FR-19 HTTP: ครั้งที่ 10 บัญชีถูกล็อก', { timeout: 30000 }, async () => {
  const r = await loginRequest(TEST_EMAIL, 'wrong-password');
  assert.equal(r.status, 403);
  assert.match(r.data.error, /กรอกรหัสผ่านผิด 10 ครั้ง/);
  assert.equal(r.data.isLocked, true);

  const [rows] = await db.execute(
    'SELECT failed_login_count, locked_until FROM users WHERE UserID = ?',
    [testUserId]
  );
  assert.equal(rows[0].failed_login_count, 0, 'count reset หลังล็อก');
  assert.ok(rows[0].locked_until, 'ต้องมี locked_until');
});

// ── Test 3: login รหัสถูกขณะล็อก → ต้องถูกปฏิเสธ (บัคหลัก) ──
test('FR-19 HTTP: login ด้วยรหัสถูกขณะล็อก ต้องถูกปฏิเสธ', { timeout: 30000 }, async () => {
  const r = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(r.status, 403, `ต้อง 403 แม้รหัสถูก แต่ได้ ${r.status}`);
  assert.match(r.data.error, /บัญชีถูกล็อกชั่วคราว/);
});

// ── Test 4: หลังปลดล็อก → login ถูกต้องต้องสำเร็จ ──
test('FR-19 HTTP: หลังปลดล็อก login ถูกต้องต้องสำเร็จ', { timeout: 30000 }, async () => {
  await db.execute(
    "UPDATE users SET locked_until = '2020-01-01 00:00:00' WHERE UserID = ?",
    [testUserId]
  );

  const r = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(r.status, 200, `ต้อง 200 แต่ได้ ${r.status}: ${JSON.stringify(r.data)}`);
  assert.equal(r.data.success, true);

  const [rows] = await db.execute(
    'SELECT failed_login_count, locked_until FROM users WHERE UserID = ?',
    [testUserId]
  );
  assert.equal(rows[0].failed_login_count, 0);
  assert.equal(rows[0].locked_until, null);
});
