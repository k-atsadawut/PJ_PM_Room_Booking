// ─── FR-19 / NFR-02: Security log helper (ESM mirror) ────────────
// Mirror ของ backend/utils/securityLog.js สำหรับใช้ใน Hono (Cloudflare/Netlify)
// sync ผ่าน test

import { executeQuery } from '../config/db';

/**
 * @param {Object} input
 * @param {number|null} input.userId
 * @param {string|null} input.email
 * @param {string}      input.eventType  — 'login_success' | 'login_failed' | 'account_locked' | 'account_unlocked' | 'password_changed'
 * @param {Object}      env              — Cloudflare env binding
 * @param {string|null} input.ipAddress
 * @param {string|null} input.userAgent
 * @param {number|null} input.failedAttempt
 * @param {string|null} input.details
 */
export async function logSecurityEvent(input, env) {
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

    await executeQuery(
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
      ],
      env
    );
  } catch (err) {
    console.error('logSecurityEvent error:', err.message);
  }
}
