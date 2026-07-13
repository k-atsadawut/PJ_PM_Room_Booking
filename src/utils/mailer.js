// Email utility for Cloudflare Workers
// Uses Cloudflare Email Routing or external SMTP service

export async function sendEmail({ to, subject, text }, env) {
  try {
    // Option 1: Use Cloudflare Email Routing (recommended for production)
    // This requires setting up Email Routing in Cloudflare dashboard
    // For now, we'll use a simple HTTP-based email service
    
    // Option 2: Use external service like SendGrid, Mailgun, or Resend via API
    // This example uses a generic HTTP POST approach
    
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
      console.error('Email configuration missing');
      return { success: false, error: 'Email configuration missing' };
    }

    // For Cloudflare Workers, we can use fetch to call email APIs
    // Example using a hypothetical email service API
    const response = await fetch('https://api.email-service.com/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SMTP_PASSWORD}`,
      },
      body: JSON.stringify({
        to,
        from: env.SMTP_FROM || 'noreply@roombooking.system',
        subject,
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Email service returned ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

export async function notifyAdminNewBooking(bookingData, adminEmail, env) {
  const subject = 'มีคำขอจองห้องใหม่';
  const text = `
มีคำขอจองห้องใหม่:

ห้อง: ${bookingData.RoomName} (ID: ${bookingData.RoomID})
วันที่: ${bookingData.BookingDate}
เวลา: ${bookingData.StartTime} - ${bookingData.EndTime}
ผู้จอง: ${bookingData.UserName} (${bookingData.UserEmail})

กรุณาเข้าสู่ระบบเพื่ออนุมัติหรือปฏิเสธการจอง
  `.trim();

  return await sendEmail({ to: adminEmail, subject, text }, env);
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
