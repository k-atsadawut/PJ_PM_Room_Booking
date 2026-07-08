-- ============================================================
-- ระบบจองห้องผลิตสื่อดิจิทัล / E-Learning Room Booking System
-- Database Schema (MySQL)
-- อ้างอิงจาก Data Dictionary ใน SRS_v2 + Roadmap Phase 1-4
-- ============================================================

CREATE DATABASE IF NOT EXISTS room_booking_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE room_booking_system;

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
    Password            VARCHAR(255)        NOT NULL,          -- เก็บแบบ hash (bcrypt/password_hash)
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
