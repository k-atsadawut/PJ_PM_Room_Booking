const cron = require('node-cron');
const db = require('../config/db');
const { sendEmail } = require('../utils/mailer');

// FR-10: แจ้งเตือนก่อนถึงเวลาจอง (รันทุกๆ 5 นาที)
// แจ้งเตือน 15 นาทีก่อนเวลาจอง
const REMINDER_MINUTES = 15;

function startReminderScheduler() {
  // รันทุกๆ 5 นาที: */5 * * * *
  const task = cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
      
      // คำนวณเวลาที่ต้องแจ้งเตือน (15 นาทีข้างหน้า)
      const reminderTimeObj = new Date(now.getTime() + REMINDER_MINUTES * 60000);
      const reminderTime = reminderTimeObj.toTimeString().slice(0, 5);

      console.log(`[Reminder] Checking for bookings at ${reminderTime}...`);

      // ค้นหา booking ที่:
      // - Status = approved
      // - BookingDate = วันนี้
      // - StartTime = เวลาที่ต้องแจ้งเตือน
      // - ยังไม่เคยถูกแจ้งเตือน (reminder_sent = 0 หรือ NULL)
      const [bookings] = await db.execute(`
        SELECT 
          b.BookingID,
          b.UserID,
          b.RoomID,
          b.BookingDate,
          b.StartTime,
          b.EndTime,
          r.RoomName,
          u.Name AS UserName,
          u.Email AS UserEmail
        FROM bookings b
        JOIN rooms r ON b.RoomID = r.RoomID
        JOIN users u ON b.UserID = u.UserID
        WHERE b.Status = 'approved'
          AND b.BookingDate = ?
          AND b.StartTime = ?
          AND (b.reminder_sent = 0 OR b.reminder_sent IS NULL)
      `, [today, reminderTime]);

      console.log(`[Reminder] Found ${bookings.length} bookings to remind`);

      for (const booking of bookings) {
        if (booking.UserEmail) {
          const subject = 'แจ้งเตือนการจองห้องใกล้ถึงเวลา';
          const text = `
เรียน ${booking.UserName},

การจองห้องของคุณใกล้ถึงเวลาแล้ว:

ห้อง: ${booking.RoomName}
วันที่: ${booking.BookingDate}
เวลา: ${booking.StartTime} - ${booking.EndTime}

กรุณาเตรียมตัวและมาตามเวลาที่กำหนด
          `.trim();

          const result = await sendEmail({ 
            to: booking.UserEmail, 
            subject, 
            text 
          });

          if (result.success) {
            // อัปเดต reminder_sent = 1
            await db.execute(
              'UPDATE bookings SET reminder_sent = 1 WHERE BookingID = ?',
              [booking.BookingID]
            );
            console.log(`[Reminder] Email sent to ${booking.UserEmail} for booking ${booking.BookingID}`);
          } else {
            console.error(`[Reminder] Failed to send email to ${booking.UserEmail}:`, result.error);
          }
        }
      }
    } catch (error) {
      console.error('[Reminder] Error:', error);
    }
  });

  console.log('[Reminder] Scheduler started (runs every 5 minutes)');
  return task;
}

module.exports = { startReminderScheduler };
