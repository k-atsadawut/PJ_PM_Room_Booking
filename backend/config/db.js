const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

// Aiven (และผู้ให้บริการ MySQL cloud ส่วนใหญ่) บังคับใช้ SSL/TLS
// ตั้งค่าผ่าน .env:
//   DB_SSL=true                → เปิดใช้ SSL
//   DB_SSL_CA_PATH=/path/ca.pem → path ไฟล์ CA cert ที่ดาวน์โหลดจาก Aiven (แนะนำ)
// ถ้าไม่ตั้ง DB_SSL เลย (เช่น รัน MySQL local) จะไม่ใช้ SSL เหมือนเดิม ไม่กระทบของเก่า
function buildSslConfig() {
  // Use TLS by default for remote databases (such as Aiven).  Local MySQL
  // development can explicitly opt out with DB_SSL=false.
  const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST);
  if (process.env.DB_SSL === 'false' || (process.env.DB_SSL !== 'true' && isLocalHost)) {
    return undefined;
  }

  if (process.env.DB_SSL_CA_PATH) {
    return {
      ca: fs.readFileSync(process.env.DB_SSL_CA_PATH),
      rejectUnauthorized: true,
    };
  }

  // Aiven uses a publicly trusted certificate, so keep certificate validation
  // enabled when a custom CA file is not configured.
  return { rejectUnauthorized: true };
}

const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'room_booking_system',
  user:     process.env.DB_USER || 'root',
  // DB_PASSWORD is the standard name used by the project's environment files;
  // retain DB_PASS for backward compatibility.
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  ssl: buildSslConfig(),
});

module.exports = pool;
