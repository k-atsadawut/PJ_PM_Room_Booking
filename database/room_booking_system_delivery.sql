-- ============================================================
--  ระบบจองห้องผลิตสื่อดิจิทัล / E-Learning Room Booking System
--  Database Script สำหรับการส่งมอบ (Delivery / Setup)
--  Engine: MySQL 8.0+   Charset: utf8mb4
--
--  วิธีใช้งาน:
--    1) แก้ค่า @DB_NAME, @DB_USER ในบล็อก "ตัวแปรการติดตั้ง" ด้านล่าง
--       (หรือรันตรงๆ หากใช้ชื่อ default)
--    2) รันสคริปต์นี้ด้วยบัญชี root/admin:
--         mysql -u root -p < room_booking_system_delivery.sql
--       หรือวางทั้งหมดใน MySQL Workbench / phpMyAdmin แล้วกด Run
--    3) เชื่อมต่อจากแอปผ่านค่าใน backend/.env
--
--  สคริปต์นี้ครอบคลุม:
--    - สร้างฐานข้อมูลและผู้ใช้ (ตัวเลือก)
--    - Schema ทุกตาราง (รวม migration ล่าสุด)
--    - ข้อมูลทดสอบ (Test Data) สำหรับ Demo / UAT
--
--  หมายเหตุ: รหัสผ่านผู้ใช้ทดสอบทั้งหมดคือ "password123"
--           (เข้ารหัสด้วย SHA-256 เช่นเดียวกับที่ระบบใช้งานจริง)
-- ============================================================

-- ------------------------------------------------------------
-- ตัวแปรการติดตั้ง (แก้ไขค่าได้ตามต้องการ)
-- ------------------------------------------------------------
SET @DB_NAME := 'room_booking_system';   -- ชื่อฐานข้อมูล
-- SET @DB_USER := 'rb_user';
-- SET @DB_PASS := 'YourStrongPasswordHere';
-- SET @DB_HOST := 'localhost';           -- วงเครื่องหมายนี้ออกเพื่อสร้าง user ใหม่ด้วย

-- ------------------------------------------------------------
-- 1) สร้างฐานข้อมูล
-- ------------------------------------------------------------
DROP DATABASE IF EXISTS `room_booking_system`;
CREATE DATABASE `room_booking_system`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `room_booking_system`;

-- ------------------------------------------------------------
-- (ตัวเลือก) สร้าง user สำหรับแอป — ยกเลิกเครื่องหมาย comment ถ้าต้องการ
-- ------------------------------------------------------------
-- CREATE USER IF NOT EXISTS `rb_user`@`localhost` IDENTIFIED BY 'YourStrongPasswordHere';
-- GRANT ALL PRIVILEGES ON `room_booking_system`.* TO `rb_user`@`localhost`;
-- FLUSH PRIVILEGES;


-- ############################################################
-- #  PART A: SCHEMA (โครงสร้างตารางทั้งหมด)
-- ############################################################

-- ------------------------------------------------------------
-- ตาราง User
-- หมายเหตุ: BR-11 ระบุว่ารหัสผ่าน = นามสกุล (ความเสี่ยงสูง)
-- เพิ่มฟิลด์ Password แยกจาก Name + force_change_password
-- เพื่อรองรับ NFR-05 (Force Change Password on First Login)
-- ------------------------------------------------------------
CREATE TABLE users (
    UserID              INT AUTO_INCREMENT PRIMARY KEY,
    Name                VARCHAR(100)        NOT NULL,
    Email               VARCHAR(150)        NOT NULL UNIQUE,
    Password            VARCHAR(255)        NOT NULL,          -- เก็บแบบ hash (SHA-256/bcrypt/password_hash)
    Role                ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
    Faculty             VARCHAR(100)        NULL,
    Department          VARCHAR(100)        NULL,
    force_change_password TINYINT(1)        NOT NULL DEFAULT 1, -- บังคับเปลี่ยนรหัสผ่านครั้งแรก (NFR-05)
    failed_login_count  TINYINT             NOT NULL DEFAULT 0, -- รองรับ FR-18/FR-19 ล็อก 10 ครั้ง/6 ชม.
    locked_until        DATETIME            NULL,
    created_at          DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Room
-- ------------------------------------------------------------
CREATE TABLE rooms (
    RoomID      INT AUTO_INCREMENT PRIMARY KEY,
    RoomName    VARCHAR(100)        NOT NULL,
    Capacity    INT                 NOT NULL DEFAULT 1,
    Status      ENUM('available','booked','maintenance') NOT NULL DEFAULT 'available',
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Booking
-- ------------------------------------------------------------
CREATE TABLE bookings (
    BookingID   INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT                 NOT NULL,
    RoomID      INT                 NOT NULL,
    BookingDate DATE                NOT NULL,
    StartTime   TIME                NOT NULL,
    EndTime     TIME                NOT NULL,
    Status      ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    reminder_sent TINYINT(1)        NOT NULL DEFAULT 0,          -- FR-10/FR-13: กันแจ้งเตือนซ้ำ
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_booking_room FOREIGN KEY (RoomID) REFERENCES rooms(RoomID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_booking_date_room (BookingDate, RoomID)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Holiday (รองรับ Phase 1 - วันหยุด)
-- ------------------------------------------------------------
CREATE TABLE holidays (
    HolidayID   INT AUTO_INCREMENT PRIMARY KEY,
    HolidayDate DATE                NOT NULL UNIQUE,
    Description VARCHAR(255)        NULL,
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Queue (รองรับ Phase 1 - คิวรอจอง กรณีห้องเต็ม)
-- ------------------------------------------------------------
CREATE TABLE queues (
    QueueID     INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT                 NOT NULL,
    RoomID      INT                 NOT NULL,
    BookingDate DATE                NOT NULL,
    StartTime   TIME                NOT NULL,
    EndTime     TIME                NOT NULL,
    Status      ENUM('waiting','notified','expired','cancelled') NOT NULL DEFAULT 'waiting',
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_queue_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_queue_room FOREIGN KEY (RoomID) REFERENCES rooms(RoomID)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Notifications (รองรับ Phase 3 - Email Notification FR-11/12/13)
-- ------------------------------------------------------------
CREATE TABLE notifications (
    NotificationID  INT AUTO_INCREMENT PRIMARY KEY,
    UserID          INT             NOT NULL,
    BookingID       INT             NULL,
    Message         VARCHAR(255)    NOT NULL,
    IsRead          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_booking FOREIGN KEY (BookingID) REFERENCES bookings(BookingID)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Maintenance Reports (รองรับ Phase 4 - QR Code แจ้งซ่อม FR-15)
-- ------------------------------------------------------------
CREATE TABLE maintenance_reports (
    ReportID    INT AUTO_INCREMENT PRIMARY KEY,
    RoomID      INT             NOT NULL,
    UserID      INT             NULL,
    Description VARCHAR(255)    NOT NULL,
    Urgency     ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
    Status      ENUM('pending','in_progress','completed','rejected') NOT NULL DEFAULT 'pending',
    Notes       VARCHAR(255)    NULL,
    ReportDate  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedDate DATETIME        NULL,
    CONSTRAINT fk_report_room FOREIGN KEY (RoomID) REFERENCES rooms(RoomID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_report_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Password Reset Requests (รองรับ Forgot Password)
-- ------------------------------------------------------------
CREATE TABLE password_reset_requests (
    RequestID   INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT             NOT NULL,
    Email       VARCHAR(150)    NOT NULL,
    Status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    RequestDate DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ProcessedDate DATETIME      NULL,
    ProcessedBy INT             NULL,
    Notes       VARCHAR(255)    NULL,
    CONSTRAINT fk_reset_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reset_admin FOREIGN KEY (ProcessedBy) REFERENCES users(UserID)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง OTP (รองรับ OTP-based Password Change / Forgot Password)
-- รวม enum 'password_reset' จาก migration 2026-07-16-otp-reset-type.sql
-- ------------------------------------------------------------
CREATE TABLE otp_codes (
    OTPID       INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT             NOT NULL,
    Email       VARCHAR(150)    NOT NULL,
    Code        VARCHAR(6)      NOT NULL,
    Type        ENUM('password_change','email_verification','password_reset') NOT NULL DEFAULT 'password_change',
    ExpiresAt   DATETIME        NOT NULL,
    Used        TINYINT(1)      NOT NULL DEFAULT 0,
    CreatedAt   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_otp_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_otp_code (Code),
    INDEX idx_otp_user (UserID),
    INDEX idx_otp_expires (ExpiresAt)
) ENGINE=InnoDB;


-- ############################################################
-- #  PART B: TEST DATA (ข้อมูลทดสอบสำหรับ Demo / UAT)
-- ############################################################

-- ------------------------------------------------------------
-- Users (รหัสผ่านทั้งหมดคือ "password123" - SHA-256 hash)
-- ------------------------------------------------------------
INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password) VALUES
('Admin User',        'admin@university.ac.th',    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'admin',    'Engineering', 'Computer Science',    0),
('Teacher Somchai',   'teacher1@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'teacher',  'Engineering', 'Electrical',          0),
('Teacher Suda',      'teacher2@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'teacher',  'Business',    'Marketing',           0),
('Student Nop',       'student1@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'student',  'Engineering', 'Computer Engineering',1),
('Student Mali',      'student2@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'student',  'Business',    'Accounting',          1),
('Student Som',       'student3@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'student',  'Arts',        'Design',              1),
('Student Dang',      'student4@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'student',  'Science',     'Physics',             1),
('Student Nam',       'student5@university.ac.th', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'student',  'IT',          'Information Technology',1);

-- ------------------------------------------------------------
-- Rooms
-- ------------------------------------------------------------
INSERT INTO rooms (RoomName, Capacity, Status) VALUES
('Digital Media Lab A',  1, 'available'),
('Digital Media Lab B',  1, 'available'),
('Recording Studio 1',   1, 'available'),
('Editing Room 1',       1, 'available');

-- ------------------------------------------------------------
-- Holidays (วันหยุดปี 2026)
-- ------------------------------------------------------------
INSERT INTO holidays (HolidayDate, Description) VALUES
('2026-01-01', 'วันขึ้นปีใหม่'),
('2026-02-14', 'วันวาเลนไทน์'),
('2026-04-13', 'วันสงกรานต์'),
('2026-04-14', 'วันสงกรานต์'),
('2026-04-15', 'วันสงกรานต์'),
('2026-05-01', 'วันแรงงานแห่งชาติ'),
('2026-05-05', 'วันฉัตรมงคล'),
('2026-07-01', 'วันเฉลิมพระชนมพรรษา'),
('2026-08-12', 'วันแม่แห่งชาติ'),
('2026-10-23', 'วันปิยมหาราช'),
('2026-12-05', 'วันพ่อแห่งชาติ'),
('2026-12-10', 'วันรัฐธรรมนูญ');

-- ------------------------------------------------------------
-- Bookings (ข้อมูลการจองตัวอย่าง)
-- ------------------------------------------------------------
-- การจองที่อนุมัติแล้ว
INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status) VALUES
(2, 1, '2026-07-02', '09:00:00', '11:00:00', 'approved'),
(2, 1, '2026-07-03', '13:00:00', '15:00:00', 'approved'),
(3, 2, '2026-07-02', '10:00:00', '12:00:00', 'approved');

-- การจองที่รออนุมัติ
INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status) VALUES
(4, 1, '2026-07-04', '09:00:00', '11:00:00', 'pending'),
(5, 3, '2026-07-05', '14:00:00', '16:00:00', 'pending'),
(6, 2, '2026-07-06', '10:00:00', '12:00:00', 'pending');

-- การจองที่ถูกปฏิเสธ
INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status) VALUES
(7, 4, '2026-07-01', '09:00:00', '11:00:00', 'rejected');

-- การจองที่ถูกยกเลิก
INSERT INTO bookings (UserID, RoomID, BookingDate, StartTime, EndTime, Status) VALUES
(8, 4, '2026-06-30', '13:00:00', '15:00:00', 'cancelled');

-- ------------------------------------------------------------
-- Queues (คิวรอจอง)
-- ------------------------------------------------------------
INSERT INTO queues (UserID, RoomID, BookingDate, StartTime, EndTime, Status) VALUES
(4, 1, '2026-07-04', '11:00:00', '13:00:00', 'waiting'),
(5, 3, '2026-07-05', '16:00:00', '18:00:00', 'waiting');

-- ------------------------------------------------------------
-- Notifications (การแจ้งเตือน)
-- ------------------------------------------------------------
INSERT INTO notifications (UserID, BookingID, Message, IsRead) VALUES
(4, 4, 'การจองห้อง Digital Media Lab A ของคุณรอการอนุมัติ', 0),
(5, 5, 'การจองห้อง Recording Studio 1 ของคุณรอการอนุมัติ', 0),
(7, 7, 'การจองห้อง Editing Room 1 ของคุณถูกปฏิเสธ', 1),
(2, 1, 'การจองห้อง Digital Media Lab A ของคุณได้รับการอนุมัติแล้ว', 1);

-- ------------------------------------------------------------
-- Maintenance Reports (รายงานการแจ้งซ่อม)
-- ------------------------------------------------------------
INSERT INTO maintenance_reports (RoomID, UserID, Description, Status) VALUES
(1, 2, 'ไมโครโฟนไม่ทำงาน', 'completed'),
(3, 4, 'หน้าจอมีจุดเสีย',  'pending'),
(4, 5, 'แอร์ไม่เย็น',       'in_progress');


-- ############################################################
-- #  PART C: สรุปผลการติดตั้ง
-- ############################################################
SELECT
    (SELECT COUNT(*) FROM users)                   AS users_count,
    (SELECT COUNT(*) FROM rooms)                   AS rooms_count,
    (SELECT COUNT(*) FROM bookings)                AS bookings_count,
    (SELECT COUNT(*) FROM holidays)                AS holidays_count,
    (SELECT COUNT(*) FROM queues)                  AS queues_count,
    (SELECT COUNT(*) FROM notifications)           AS notifications_count,
    (SELECT COUNT(*) FROM maintenance_reports)     AS maintenance_reports_count,
    (SELECT COUNT(*) FROM password_reset_requests) AS password_reset_requests_count,
    (SELECT COUNT(*) FROM otp_codes)               AS otp_codes_count;

-- ============================================================
--  ติดตั้งเสร็จสมบูรณ์!
--
--  บัญชีทดสอบ (รหัสผ่าน: password123):
--    Admin    : admin@university.ac.th
--    Teacher  : teacher1@university.ac.th  /  teacher2@university.ac.th
--    Student  : student1@university.ac.th  -  student5@university.ac.th
--
--  ขั้นตอนถัดไป:
--    1) ตั้งค่าการเชื่อมต่อฐานข้อมูลใน backend/.env
--         DB_HOST=127.0.0.1
--         DB_PORT=3306
--         DB_NAME=room_booking_system
--         DB_USER=root (หรือ rb_user ถ้าสร้างไว้)
--         DB_PASSWORD=...
--         DB_SSL=false   (สำหรับ local; ใช้ true บน Aiven/cloud)
--    2) cd backend && npm install && npm start
--    3) เปิด frontend แล้วล็อกอินด้วยบัญชีทดสอบด้านบน
-- ============================================================
