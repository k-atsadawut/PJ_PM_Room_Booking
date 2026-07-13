// MySQL connection utility for Netlify Functions
// Uses environment variables instead of Cloudflare Hyperdrive

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

let pool = null;

export function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 
      `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`;
    
    // Load Aiven CA certificate for secure SSL connection
    let sslConfig = { rejectUnauthorized: false };
    
    try {
      const caPath = path.resolve(process.cwd(), 'aiven-ca.pem');
      if (fs.existsSync(caPath)) {
        sslConfig = {
          ca: fs.readFileSync(caPath),
          rejectUnauthorized: true,
        };
      }
    } catch (error) {
      console.warn('Warning: Could not load Aiven CA certificate, using insecure SSL');
    }
    
    pool = mysql.createPool(connectionString, {
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      ssl: sslConfig,
    });
  }
  
  return pool;
}

// Helper functions to match the original backend's API
export async function executeQuery(sql, params = []) {
  const db = getDb();
  const [rows] = await db.execute(sql, params);
  return rows;
}
