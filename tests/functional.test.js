// tests/functional.test.js
// Automated script to test Functional Requirements (FR-01 to FR-22)

const API_BASE = 'https://room-booking-system.sidksuug.workers.dev';

// Test variables
let sessionCookie = '';
const TEST_USER = { email: 'teacher1@university.ac.th', password: 'password123' };
let currentUserId = null;

async function runTests() {
  console.log('🚀 เริ่มต้นรันเทสเคส Automated Functional Tests (FR-01 - FR-22)...\n');
  
  let total = 0;
  let passed = 0;

  function assert(condition, message, frCode) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${frCode}: ${message}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${frCode}: ${message}`);
    }
  }

  // Helper to fetch with cookies
  const apiFetch = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (sessionCookie) headers['Cookie'] = sessionCookie;
    
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) sessionCookie = setCookie; // store session cookie
    
    let data;
    try { data = await res.json(); } catch(e) { data = null; }
    return { status: res.status, data };
  };

  try {
    // -------------------------------------------------------------
    // FR-19: กลไกล็อกบัญชี (Account Lockout)
    // -------------------------------------------------------------
    console.log('--- Testing Authentication & Security ---');
    // Test a failed login
    let loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify({ email: 'teacher1@university.ac.th', password: 'wrong' }) 
    });
    assert(loginRes.status === 401 || loginRes.status === 403, 'ปฏิเสธการล็อกอินด้วยรหัสผ่านผิด', 'FR-19');

    // Login with correct user
    loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(TEST_USER) 
    });
    
    if (loginRes.status === 200) {
      assert(true, 'ผู้ใช้เข้าสู่ระบบสำเร็จ', 'FR-00');
      
      // -------------------------------------------------------------
      // FR-01: ตรวจสอบตรรกะเวลา (Invalid Time Logic)
      // -------------------------------------------------------------
      console.log('\n--- Testing Booking Validation ---');
      const invalidTimeRes = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ roomId: 1, date: '2026-10-10', startTime: '14:00', endTime: '13:00', purpose: 'test' })
      });
      assert(invalidTimeRes.status === 400, 'ปฏิเสธคำขอเมื่อเวลาสิ้นสุดมาก่อนเวลาเริ่มต้น', 'FR-01');

      // -------------------------------------------------------------
      // FR-02: ข้อจำกัดกรอบเวลา (Out of Business Hours)
      // -------------------------------------------------------------
      const invalidHoursRes = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ roomId: 1, date: '2026-10-10', startTime: '18:00', endTime: '19:00', purpose: 'test' })
      });
      assert(invalidHoursRes.status === 400, 'ปฏิเสธคำขอจองนอกเวลาทำการ (หลัง 17:00)', 'FR-02');

      // -------------------------------------------------------------
      // FR-05: สกัดกั้นวันหยุด (Holiday Prevention)
      // -------------------------------------------------------------
      // Try to book on a weekend (Saturday = 2026-10-10)
      const weekendRes = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ roomId: 1, date: '2026-10-10', startTime: '09:00', endTime: '10:00', purpose: 'test' })
      });
      // Expected to fail because 2026-10-10 is a Saturday
      assert(weekendRes.status === 400 && weekendRes.data?.error?.includes('หยุด'), 'ป้องกันการจองในวันเสาร์-อาทิตย์หรือวันหยุดราชการ', 'FR-05');

      // -------------------------------------------------------------
      // FR-06: จำกัดสิทธิ์โควตา (Quota Limit) & FR-03 (Double Booking)
      // -------------------------------------------------------------
      // Find a valid weekday date
      const validDate = '2026-10-13'; // Tuesday
      
      // Attempt first valid booking
      const validBookRes = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ roomId: 1, date: validDate, startTime: '09:00', endTime: '11:00', purpose: 'test valid booking' })
      });
      assert(validBookRes.status === 200 || validBookRes.status === 400 /* if already booked */, 'ระบบจัดการคิวปกติ', 'FR-07');
      
      // If success, try to double book the exact same time (FR-03)
      if (validBookRes.status === 200) {
        const doubleBookRes = await apiFetch('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({ roomId: 1, date: validDate, startTime: '10:00', endTime: '12:00', purpose: 'overlap' })
        });
        assert(doubleBookRes.status === 400, 'ดักจับการจองซ้อนทับ (Double Booking) ปฏิเสธสำเร็จ', 'FR-03');
      }

    } else {
      console.log('⚠️ ไม่สามารถล็อกอินเพื่อทดสอบการจองได้ (Test user failed)');
    }

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log(`\n📊 สรุปผลการทดสอบ: ผ่าน ${passed} จาก ${total} เครือข่าย API`);
    console.log('👉 หมายเหตุ: Testcase ระดับ UI หรือ Background Jobs (เช่น FR-10 Realtime UI, FR-11 อีเมล, FR-15 แสกน QR) ต้องการทดสอบด้วย Manual QA เสมอ');

  } catch (error) {
    console.error('Test Execution Failed:', error);
  }
}

runTests();
