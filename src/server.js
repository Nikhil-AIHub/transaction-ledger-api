import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';

const server = app.listen(env.port, () => {
  console.log(`Transaction Ledger API running on http://localhost:${env.port}`);
  console.log(`API docs (Swagger UI): http://localhost:${env.port}/api-docs`);
});

// Graceful shutdown: stop accepting requests, finish in-flight ones, then close DB connections.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
