// MySQL connection utility for Cloudflare Workers
// Uses Hyperdrive for database connection

import { createConnection } from 'mysql2/promise';

let connection = null;

export async function executeQuery(sql, params = [], env) {
  if (!connection) {
    // Use Hyperdrive MySQL properties with disableEval for Workers
    connection = await createConnection({
      host: env.HYPERDRIVE.host,
      user: env.HYPERDRIVE.user,
      password: env.HYPERDRIVE.password,
      database: env.HYPERDRIVE.database,
      port: env.HYPERDRIVE.port,
      disableEval: true,  // REQUIRED for Workers to avoid eval()
    });
  }

  const [results] = await connection.query(sql, params);
  return results;
}
