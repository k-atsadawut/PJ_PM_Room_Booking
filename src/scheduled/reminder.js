import { executeQuery } from '../config/db';

// FR-10: แจ้งเตือนก่อนถึงเวลาจอง (รันทุกๆ 5 นาที)
// แจ้งเตือน 15 นาทีก่อนเวลาจอง
const REMINDER_MINUTES = 15;

export async function scheduled(event, env, ctx) {
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
    const bookings = await executeQuery(`
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
    `, [today, reminderTime], env);

    console.log(`[Reminder] Found ${bookings.length} bookings to remind`);

    for (const booking of bookings) {
      if (booking.UserEmail) {
        // Send email notification
        const subject = 'แจ้งเตือนการจองห้องใกล้ถึงเวลา';
        const text = `
เรียน ${booking.UserName},

การจองห้องของคุณใกล้ถึงเวลาแล้ว:

ห้อง: ${booking.RoomName}
วันที่: ${booking.BookingDate}
เวลา: ${booking.StartTime} - ${booking.EndTime}

กรุณาเตรียมตัวและมาตามเวลาที่กำหนด
        `.trim();

        // Send email using Cloudflare Email Routing or external SMTP
        // For now, we'll log it. You can integrate with:
        // - Cloudflare Email Routing
        // - SendGrid/Resend via fetch
        // - Or any email service
        
        console.log(`[Reminder] Would send email to ${booking.UserEmail}:`, { subject, text });

        // If you have email integration, uncomment and configure:
        // await sendEmail({ to: booking.UserEmail, subject, text }, env);

        // อัปเดต reminder_sent = 1
        await executeQuery(
          'UPDATE bookings SET reminder_sent = 1 WHERE BookingID = ?',
          [booking.BookingID],
          env
        );
        console.log(`[Reminder] Marked booking ${booking.BookingID} as reminded`);
      }
    }
  } catch (error) {
    console.error('[Reminder] Error:', error);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduled(event, env, ctx));
  }
};
