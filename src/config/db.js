import { connect } from '@tidbcloud/serverless';

let connection;

export async function executeQuery(sql, params = [], env) {
  if (!env.TIDB_PASSWORD) {
    throw new Error('Missing TIDB_PASSWORD secret');
  }
  if (!connection) {
    const tidbHost = env.TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
    const tidbUser = env.TIDB_USER || '2mnuCsWPGGp1yoy.root';
    const tidbDatabase = env.TIDB_DATABASE || 'room_booking_system';
    
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
