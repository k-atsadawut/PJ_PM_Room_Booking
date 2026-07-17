// ─── FR-19: กลไกล็อกบัญชีหลังกรอกรหัสผ่านผิด N ครั้ง (ESM mirror) ───
// Mirror ของ backend/utils/authLock.js สำหรับใช้ใน Hono (Cloudflare/Netlify)
// ฝั่ง Express ใช้ CommonJS ส่วนฝั่งนี้ใช้ ESM — logic ต้องตรงกันเปะ
// sync ผ่าน test (backend/tests/auth-lock.test.js)

export const DEFAULT_MAX_ATTEMPTS = 10;
export const DEFAULT_LOCK_MINUTES = 360; // 6 ชั่วโมง (FR-19)

/**
 * คำนวณผลการพยายาม login หนึ่งครั้ง — ดู docstring ใน backend/utils/authLock.js
 */
export function evaluateLoginAttempt({
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

  const maxAtt = Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS;
  const lockMin = Number(lockMinutes) || DEFAULT_LOCK_MINUTES;

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

  if (passwordValid) {
    return {
      action: 'allow',
      attempts: 0,
      lockedUntil: null,
      errorMessage: null,
      shouldResetCount: true,
    };
  }

  const currentCount = Number(user.failed_login_count) || 0;
  const attempts = currentCount + 1;

  if (attempts >= maxAtt) {
    const newLockedUntil = new Date(now.getTime() + lockMin * 60 * 1000);
    const lockHours = Math.round((lockMin / 60) * 10) / 10;
    return {
      action: 'lock',
      attempts: 0,
      lockedUntil: newLockedUntil,
      errorMessage: `กรอกรหัสผ่านผิด ${maxAtt} ครั้ง บัญชีถูกล็อก ${lockHours} ชั่วโมง`,
      shouldResetCount: true,
    };
  }

  return {
    action: 'reject',
    attempts,
    lockedUntil: null,
    errorMessage: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (${attempts}/${maxAtt})`,
    shouldResetCount: false,
  };
}

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
