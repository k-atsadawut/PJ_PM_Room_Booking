const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'room_booking_system',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
