-- ============================================================
-- Add Password Reset Requests Table
-- Run this to add the new table to existing database
-- ============================================================

USE room_booking_system;

-- ------------------------------------------------------------
-- ตาราง Password Reset Requests (รองรับ Forgot Password)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_requests (
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
