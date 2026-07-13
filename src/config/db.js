// MySQL connection utility for Cloudflare Workers
// Supports both Hyperdrive and direct MySQL connections

import mysql from 'mysql2/promise';

let pool = null;

export function getDb(env) {
  if (!pool) {
    // Use Hyperdrive if available (recommended for Cloudflare)
    if (env?.HYPERDRIVE) {
      pool = mysql.createPool(env.HYPERDRIVE.connectionString, {
        waitForConnections: true,
        connectionLimit: 5,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
    } else {
      // Fallback to direct MySQL connection
      const connectionString = env?.DATABASE_URL ||
        `mysql://${env?.DB_USER}:${env?.DB_PASSWORD}@${env?.DB_HOST}:${env?.DB_PORT || 3306}/${env?.DB_NAME}`;

      // TiDB and Aiven expose TLS endpoints. Keep certificate validation on.
      let sslConfig = { rejectUnauthorized: true };

      if (env?.DB_CA_CERT) {
        sslConfig = {
          ca: env.DB_CA_CERT,
          rejectUnauthorized: true,
        };
      }

      pool = mysql.createPool(connectionString, {
        waitForConnections: true,
        connectionLimit: 5,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ssl: sslConfig,
      });
    }
  }

  return pool;
}

// Helper functions to match the original backend's API
export async function executeQuery(sql, params = [], env) {
  const db = getDb(env);
  const [rows] = await db.execute(sql, params);
  return rows;
}
