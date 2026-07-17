// ─── FR-19: กลไกล็อกบัญชีหลังกรอกรหัสผ่านผิด N ครั้ง ──────────────
// Pure function — ไม่แตะ DB / req / res เพื่อให้ทดสอบได้แบบ deterministic
// Express และ Hono เรียกใช้ logic ชุดเดียวกัน (sync ผ่าน test)

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_LOCK_MINUTES = 360; // 6 ชั่วโมง (FR-19)

/**
 * คำนวณผลการพยายาม login หนึ่งครั้ง
 *
 * @param {Object}  input
 * @param {Object}  input.user            — แถวจากตาราง users (ต้องมี failed_login_count, locked_until)
 * @param {boolean} input.passwordValid   — ผลตรวจรหัสผ่าน
 * @param {Date}    [input.now]           — เวลาปัจจุบัน (mock ได้)
 * @param {number}  [input.maxAttempts]   — จำนวนครั้งที่ยอมรับก่อนล็อก (default 10)
 * @param {number}  [input.lockMinutes]   — ระยะเวลาล็อกเป็นนาที (default 360)
 * @returns {Object} result
 *   - action: 'allow' | 'reject' | 'lock'
 *   - attempts: จำนวนครั้งที่นับสะสม (หลังรวมครั้งนี้) — null เมื่อยังล็อกอยู่
 *   - lockedUntil: Date | null — เวลาปลดล็อก (เมื่อ action='lock' หรือยังล็อกอยู่)
 *   - errorMessage: string | null
 *   - shouldResetCount: boolean — true หมายถึง DB ควร reset count=0 (allow/lock)
 */
function evaluateLoginAttempt({
  user,
  passwordValid,
  now = new Date(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  lockMinutes = DEFAULT_LOCK_MINUTES,
}) {
  if (!user) {
    return {
      action: 'reject',
      attempts: null,
      lockedUntil: null,
      errorMessage: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      shouldResetCount: false,
    };
  }

  // บังคับเป็นตัวเลข — กัน null/undefined ที่ทำให้ count ติดที่ 1 เสมอ
  const maxAtt = Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS;
  const lockMin = Number(lockMinutes) || DEFAULT_LOCK_MINUTES;

  // ── กรณีบัญชีกำลังถูกล็อกอยู่ ─────────────────────────────────
  // ตรวจก่อนตรวจรหัสผ่าน — ป้องกัน login ด้วยรหัสถูกขณะล็อก (FR-19)
  const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
  const isStillLocked = lockedUntil && now < lockedUntil;

  if (isStillLocked) {
    const unlockTimeStr = formatUnlockTime(lockedUntil, now);
    return {
      action: 'lock',
      attempts: null,
      lockedUntil: lockedUntil,
      errorMessage: `บัญชีถูกล็อกชั่วคราว กรุณารอจนถึง ${unlockTimeStr} น.`,
      shouldResetCount: false,
    };
  }

  // ── กรณีรหัสผ่านถูกต้อง ────────────────────────────────────────
  if (passwordValid) {
    return {
      action: 'allow',
      attempts: 0,
      lockedUntil: null,
      errorMessage: null,
      shouldResetCount: true, // reset count + clear lock (กรณีหมดเวลาล็อกแล้ว)
    };
  }

  // ── กรณีรหัสผ่านผิด — นับสะสมและอาจล็อก ────────────────────────
  // +1 ทุกครั้งเสมอ (กันบัค "ติดที่ 1/10" จากการอ่านค่าเก่าผิด)
  const currentCount = Number(user.failed_login_count) || 0;
  const attempts = currentCount + 1;

  if (attempts >= maxAtt) {
    // ล็อกบัญชี และ reset count เพื่อให้รอบถัดไป (หลังปลดล็อก) เริ่มนับใหม่
    const newLockedUntil = new Date(now.getTime() + lockMin * 60 * 1000);
    const lockHours = Math.round((lockMin / 60) * 10) / 10;
    return {
      action: 'lock',
      attempts: 0,
      lockedUntil: newLockedUntil,
      errorMessage: `กรอกรหัสผ่านผิด ${maxAtt} ครั้ง บัญชีถูกล็อก ${lockHours} ชั่วโมง`,
      shouldResetCount: true, // set count=0, locked_until=newLockedUntil
    };
  }

  // ผิดยังไม่ถึงเกณฑ์ล็อก — เก็บ count
  return {
    action: 'reject',
    attempts,
    lockedUntil: null,
    errorMessage: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (${attempts}/${maxAtt})`,
    shouldResetCount: false,
  };
}

/**
 * ฟอร์แมตเวลาปลดล็อกเป็น "HH:MM" โดยไม่ใช้ toLocaleTimeString (locale-dependent)
 * หากปลดล็อกในวันถัดไป ให้ระบุวันที่ด้วย
 */
function formatUnlockTime(lockedUntil, now) {
  const pad = (n) => String(n).padStart(2, '0');
  const hh = pad(lockedUntil.getHours());
  const mm = pad(lockedUntil.getMinutes());
  const sameDay =
    lockedUntil.getFullYear() === now.getFullYear() &&
    lockedUntil.getMonth() === now.getMonth() &&
    lockedUntil.getDate() === now.getDate();
  if (sameDay) {
    return `${hh}:${mm}`;
  }
  const dd = pad(lockedUntil.getDate());
  const month = pad(lockedUntil.getMonth() + 1);
  return `${dd}/${month} ${hh}:${mm}`;
}

module.exports = {
  evaluateLoginAttempt,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_LOCK_MINUTES,
};
