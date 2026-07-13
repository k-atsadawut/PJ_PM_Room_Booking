import { sendReminderEmail } from '../../src/utils/mailer';
import { executeQuery } from '../../src/config/db';

const REMINDER_MINUTES = 15;

export default async (req, context) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    // Calculate reminder time (15 minutes ahead)
    const reminderTimeObj = new Date(now.getTime() + REMINDER_MINUTES * 60000);
    const reminderTime = reminderTimeObj.toTimeString().slice(0, 5);

    console.log(`[Reminder] Checking for bookings at ${reminderTime}...`);

    // Find bookings that:
    // - Status = approved
    // - BookingDate = today
    // - StartTime = reminder time
    // - Not yet reminded (reminder_sent = 0 or NULL)
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
    `, [today, reminderTime]);

    console.log(`[Reminder] Found ${bookings.length} bookings to remind`);

    for (const booking of bookings) {
      if (booking.UserEmail) {
        const result = await sendReminderEmail(booking, process.env);

        if (result.success) {
          // Update reminder_sent = 1
          await executeQuery(
            'UPDATE bookings SET reminder_sent = 1 WHERE BookingID = ?',
            [booking.BookingID]
          );
          
          console.log(`[Reminder] Email sent to ${booking.UserEmail} for booking ${booking.BookingID}`);
        } else {
          console.error(`[Reminder] Failed to send email to ${booking.UserEmail}:`, result.error);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, processed: bookings.length }),
    };
  } catch (error) {
    console.error('[Reminder] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};

export const config = {
  schedule: "*/5 * * * *", // Run every 5 minutes
};
