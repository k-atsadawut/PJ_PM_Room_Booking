import { connect } from '@tidbcloud/serverless';

let connection;

export async function executeQuery(sql, params = [], env) {
  if (!env.TIDB_PASSWORD) {
    throw new Error('Missing TIDB_PASSWORD secret');
  }
  if (!env.TIDB_HOST || !env.TIDB_USER || !env.TIDB_DATABASE) {
    throw new Error('Missing required TiDB secrets: TIDB_HOST, TIDB_USER, TIDB_DATABASE');
  }
  if (!connection) {
    const tidbHost = env.TIDB_HOST;
    const tidbUser = env.TIDB_USER;
    const tidbDatabase = env.TIDB_DATABASE;
    
    connection = connect({
      url: `mysql://${tidbUser}:${env.TIDB_PASSWORD}@${tidbHost}/${tidbDatabase}`
    });
  }

  try {
    return await connection.execute(sql, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}
