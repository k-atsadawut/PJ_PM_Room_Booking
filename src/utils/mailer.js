// Email utility for Cloudflare Workers
// Sends email via Gmail SMTP using nodemailer.
// Cloudflare Workers supports raw TCP sockets via the `nodejs_compat` flag,
// which enables nodemailer's SMTP transport.
//
// Setup:
//   1. Enable 2-Step Verification on the Gmail account
//   2. Create an App Password at https://myaccount.google.com/apppasswords
//   3. Set these secrets via wrangler:
//        npx wrangler secret put GMAIL_USER       (e.g. you@gmail.com)
//        npx wrangler secret put GMAIL_APP_PASSWORD (16-char App Password)

import nodemailer from 'nodemailer';

export async function sendEmail({ to, subject, text }, env) {
  try {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
      console.error('Email configuration missing: GMAIL_USER / GMAIL_APP_PASSWORD not set');
      return { success: false, error: 'Email configuration missing (GMAIL_USER / GMAIL_APP_PASSWORD)' };
    }

    // Create a fresh transporter per request. Workers are stateless, and
    // reusing a pooled connection across invocations is unreliable here.
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: env.GMAIL_USER,   // Gmail forces From = authenticated account
      to,
      subject,
      text,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

export async function notifyAdminNewBooking(bookingData, adminEmail, env) {
  const subject = 'มีการจองห้องใหม่';
  const text = `
มีการจองห้องใหม่ (อนุมัติอัตโนมัติ):

ห้อง: ${bookingData.RoomName} (ID: ${bookingData.RoomID})
วันที่: ${bookingData.BookingDate}
เวลา: ${bookingData.StartTime} - ${bookingData.EndTime}
ผู้จอง: ${bookingData.UserName} (${bookingData.UserEmail})

ระบบได้อนุมัติการจองอัตโนมัติแล้ว
  `.trim();

  return await sendEmail({ to: adminEmail, subject, text }, env);
}

export async function notifyUserBookingConfirmed(bookingData, userEmail, env) {
  const subject = 'การจองห้องสำเร็จ';
  const text = `
การจองห้องของคุณสำเร็จแล้ว:

ห้อง: ${bookingData.RoomName}
วันที่: ${bookingData.BookingDate}
เวลา: ${bookingData.StartTime} - ${bookingData.EndTime}

กรุณามาตามเวลาที่กำหนด
  `.trim();

  return await sendEmail({ to: userEmail, subject, text }, env);
}

export async function notifyBookingApproved(bookingData, userEmail, env) {
  const subject = 'การจองห้องได้รับการอนุมัติ';
  const text = `
การจองห้องของคุณได้รับการอนุมัติแล้ว:

ห้อง: ${bookingData.RoomName}
วันที่: ${bookingData.BookingDate}
เวลา: ${bookingData.StartTime} - ${bookingData.EndTime}

กรุณามาตามเวลาที่กำหนด
  `.trim();

  return await sendEmail({ to: userEmail, subject, text }, env);
}

export async function notifyBookingRejected(bookingData, userEmail, env) {
  const subject = 'การจองห้องถูกปฏิเสธ';
  const text = `
การจองห้องของคุณถูกปฏิเสธ:

ห้อง: ${bookingData.RoomName}
วันที่: ${bookingData.BookingDate}
เวลา: ${bookingData.StartTime} - ${bookingData.EndTime}

กรุณาติดต่อเจ้าหน้าที่หากต้องการข้อมูลเพิ่มเติม
  `.trim();

  return await sendEmail({ to: userEmail, subject, text }, env);
}

export async function sendReminderEmail(bookingData, env) {
  const subject = 'แจ้งเตือนการจองห้องใกล้ถึงเวลา';
  const text = `
เรียน ${bookingData.UserName},

การจองห้องของคุณใกล้ถึงเวลาแล้ว:

ห้อง: ${bookingData.RoomName}
วันที่: ${bookingData.BookingDate}
เวลา: ${bookingData.StartTime} - ${bookingData.EndTime}

กรุณาเตรียมตัวและมาตามเวลาที่กำหนด
  `.trim();

  return await sendEmail({ to: bookingData.UserEmail, subject, text }, env);
}

export async function notifyAdminMaintenance(reportData, adminEmail, env) {
  const subject = `แจ้งซ่อมห้อง ${reportData.RoomName}`;
  const text = `
มีรายงานการแจ้งซ่อมใหม่:

ห้อง: ${reportData.RoomName}
ผู้แจ้ง: ${reportData.ReporterName}
รายละเอียด: ${reportData.Description}
ความเร่งด่วน: ${reportData.Urgency === 'urgent' ? 'ด่วนที่สุด' : 'ปกติ'}

กรุณาเข้าสู่ระบบเพื่อตรวจสอบ
  `.trim();

  return await sendEmail({ to: adminEmail, subject, text }, env);
}
