-- Migration: เพิ่ม enum value 'password_reset' สำหรับ otp_codes.Type
-- รันบน production database ก่อน deploy code ใหม่
-- ที่มา: flow "ลืมรหัสผ่าน" ใหม่ใช้ OTP แทนการรอ admin อนุมัติ

ALTER TABLE otp_codes
  MODIFY COLUMN Type ENUM('password_change','email_verification','password_reset')
  NOT NULL DEFAULT 'password_change';
