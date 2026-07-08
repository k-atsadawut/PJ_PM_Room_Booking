-- ============================================================
-- ข้อมูลทดสอบ / Test Data for Room Booking System
-- ============================================================

USE room_booking_system;

-- ------------------------------------------------------------
-- Users (รหัสผ่านทั้งหมดคือ "password123" - plain text)
-- ------------------------------------------------------------
INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password) VALUES
('Admin User', 'admin@university.ac.th', 'password123', 'admin', 'IT', 'Computer Science', 0),
('Teacher Somchai', 'teacher1@university.ac.th', 'password123', 'teacher', 'Engineering', 'Electrical', 0),
('Teacher Suda', 'teacher2@university.ac.th', 'password123', 'teacher', 'Business', 'Marketing', 0),
('Student Nop', 'student1@university.ac.th', 'password123', 'student', 'Engineering', 'Computer Engineering', 1),
('Student Mali', 'student2@university.ac.th', 'password123', 'student', 'Business', 'Accounting', 1),
('Student Som', 'student3@university.ac.th', 'password123', 'student', 'Arts', 'Design', 1),
('Student Dang', 'student4@university.ac.th', 'password123', 'student', 'Science', 'Physics', 1),
('Student Nam', 'student5@university.ac.th', 'password123', 'student', 'IT', 'Information Technology', 1);

-- ------------------------------------------------------------
-- Rooms
-- ------------------------------------------------------------
INSERT INTO rooms (RoomName, Capacity, Status) VALUES
('Digital Media Lab A', 1, 'available'),
('Digital Media Lab B', 1, 'available'),
('Recording Studio 1', 1, 'available'),
('Editing Room 1', 1, 'available');

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
(8, 5, '2026-06-30', '13:00:00', '15:00:00', 'cancelled');

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
(1, 2, 'ไมโครโฟนไม่ทำงาน', 'resolved'),
(3, 4, 'หน้าจอมีจุดเสีย', 'open'),
(4, 5, 'แอร์ไม่เย็น', 'in_progress');

-- ------------------------------------------------------------
-- หมายเหตุ:
-- - รหัสผ่านทั้งหมดคือ "password123" (bcrypt hash)
-- - Admin ไม่ต้องเปลี่ยนรหัสผ่าน (force_change_password = 0)
-- - Students ทั้งหมดต้องเปลี่ยนรหัสผ่านครั้งแรก (force_change_password = 1)
-- - ข้อมูลการจองมีสถานะต่างๆ เพื่อทดสอบ workflow ทั้งหมด
-- ============================================================
