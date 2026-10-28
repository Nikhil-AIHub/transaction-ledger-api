// Usage: npm run db:migrate
import { pool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';

try {
  await runMigrations(pool);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
