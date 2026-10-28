import pg from 'pg';
import { env } from './env.js';

// PostgreSQL returns NUMERIC as a string to avoid precision loss. Our amounts have at
// most 2 decimal places and are bounded by validation, so converting to a JS number is safe.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
});

/**
 * Runs `work(client)` inside a single database transaction.
 * COMMIT if it resolves, ROLLBACK if it throws - so either every change is saved or none is.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
