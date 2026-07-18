-- ─── FR-19 / NFR-02: Security log สำหรับตรวจสอบการ login ───────────
-- เก็บประวัติการพยายาม login ทั้งสำเร็จและล้มเหลว เพื่อ audit/forensics
-- รองรับ test case TC-FR-19-006, TC-NFR-02-003 ถึง TC-NFR-02-006

CREATE TABLE IF NOT EXISTS security_logs (
    LogID           INT AUTO_INCREMENT PRIMARY KEY,
    UserID          INT                 NULL,                -- NULL = email ไม่มีในระบบ
    Email           VARCHAR(150)        NULL,
    EventType       ENUM('login_success','login_failed','account_locked','account_unlocked','password_changed')
                    NOT NULL,
    IPAddress       VARCHAR(45)         NULL,                -- IPv4/IPv6
    UserAgent       VARCHAR(255)        NULL,
    FailedAttempt   INT                 NULL,                -- จำนวนครั้งนับสะสม (ถ้ามี)
    Details         VARCHAR(500)        NULL,
    CreatedAt       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_security_user   (UserID),
    INDEX idx_security_event  (EventType),
    INDEX idx_security_time   (CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
