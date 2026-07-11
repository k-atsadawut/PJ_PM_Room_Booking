const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

// Aiven (และผู้ให้บริการ MySQL cloud ส่วนใหญ่) บังคับใช้ SSL/TLS
// ตั้งค่าผ่าน .env:
//   DB_SSL=true                → เปิดใช้ SSL
//   DB_SSL_CA_PATH=/path/ca.pem → path ไฟล์ CA cert ที่ดาวน์โหลดจาก Aiven (แนะนำ)
// ถ้าไม่ตั้ง DB_SSL เลย (เช่น รัน MySQL local) จะไม่ใช้ SSL เหมือนเดิม ไม่กระทบของเก่า
function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;

  if (process.env.DB_SSL_CA_PATH) {
    return {
      ca: fs.readFileSync(process.env.DB_SSL_CA_PATH),
      rejectUnauthorized: true,
    };
  }

  // fallback: เข้ารหัสอย่างเดียว ไม่ตรวจสอบ CA (ใช้ชั่วคราวตอน dev เท่านั้น
  // ไม่แนะนำสำหรับ production เพราะเสี่ยง man-in-the-middle)
  return { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'room_booking_system',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  ssl: buildSslConfig(),
});

module.exports = pool;