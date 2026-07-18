// ─── FR-19 / NFR-02: Security log helper ─────────────────────────
// บันทึก security event ลงตาราง security_logs (audit trail)
// Pure write helper — ไม่ throw เพื่อไม่ให้บั่นทอน flow หลัก
//
// รองรับ test case:
//   TC-FR-19-006, TC-NFR-02-003 ถึง TC-NFR-02-006 (Security Log verification)

/**
 * @param {Object} deps
 * @param {Object} deps.db           — DB abstraction (mysql2 pool หรือ executeQuery wrapper)
 * @param {Object} input
 * @param {number|null} input.userId
 * @param {string|null} input.email
 * @param {string}      input.eventType  — 'login_success' | 'login_failed' | 'account_locked' | 'account_unlocked' | 'password_changed'
 * @param {string|null} input.ipAddress
 * @param {string|null} input.userAgent
 * @param {number|null} input.failedAttempt
 * @param {string|null} input.details
 */
async function logSecurityEvent(deps, input) {
  try {
    const {
      userId = null,
      email = null,
      eventType,
      ipAddress = null,
      userAgent = null,
      failedAttempt = null,
      details = null,
    } = input;

    if (!eventType) return;
    if (!deps || typeof deps.query !== 'function') return;

    await deps.query(
      `INSERT INTO security_logs
         (UserID, Email, EventType, IPAddress, UserAgent, FailedAttempt, Details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email,
        eventType,
        ipAddress,
        userAgent ? String(userAgent).slice(0, 255) : null,
        failedAttempt,
        details,
      ]
    );
  } catch (err) {
    // ไม่ throw — security log ห้ามทำให้ flow หลักล้มเหลว
    console.error('logSecurityEvent error:', err.message);
  }
}

module.exports = { logSecurityEvent };
