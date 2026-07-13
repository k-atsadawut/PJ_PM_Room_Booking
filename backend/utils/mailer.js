const nodemailer = require('nodemailer');

// Create transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Send email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} [options.html] - HTML content (optional)
 */
async function sendEmail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'noreply@example.com',
      to,
      subject,
      text,
      html,
    });
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to admin about new booking request
 * @param {Object} booking - Booking details
 * @param {string} adminEmail - Admin email address
 */
async function notifyAdminNewBooking(booking, adminEmail) {
  const subject = `คำขอจองห้องใหม่ - ${booking.RoomName || booking.RoomID}`;
  const text = `
มีคำขอจองห้องใหม่:

ห้อง: ${booking.RoomName || booking.RoomID}
วันที่: ${booking.BookingDate}
เวลา: ${booking.StartTime} - ${booking.EndTime}
ผู้จอง: ${booking.UserName || 'ไม่ระบุ'}
อีเมล: ${booking.UserEmail || 'ไม่ระบุ'}

กรุณาเข้าสู่ระบบเพื่ออนุมัติหรือปฏิเสธคำขอ
  `.trim();

  return sendEmail({ to: adminEmail, subject, text });
}

/**
 * Send notification to user about booking status change
 * @param {Object} booking - Booking details
 * @param {string} userEmail - User email address
 * @param {string} status - 'approved' or 'rejected'
 */
async function notifyUserBookingStatus(booking, userEmail, status) {
  const isApproved = status === 'approved';
  const subject = isApproved 
    ? 'การจองห้องได้รับการอนุมัติ'
    : 'การจองห้องถูกปฏิเสธ';
  
  const text = isApproved
    ? `
การจองห้องของคุณได้รับการอนุมัติแล้ว:

ห้อง: ${booking.RoomName || booking.RoomID}
วันที่: ${booking.BookingDate}
เวลา: ${booking.StartTime} - ${booking.EndTime}

กรุณามาตามเวลาที่จอง
    `.trim()
    : `
การจองห้องของคุณถูกปฏิเสธ:

ห้อง: ${booking.RoomName || booking.RoomID}
วันที่: ${booking.BookingDate}
เวลา: ${booking.StartTime} - ${booking.EndTime}

หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ
    `.trim();

  return sendEmail({ to: userEmail, subject, text });
}

module.exports = {
  sendEmail,
  notifyAdminNewBooking,
  notifyUserBookingStatus,
};
