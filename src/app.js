import fs from 'node:fs';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { pool } from './config/database.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { ErrorCodes } from './utils/AppError.js';

const openApiSpec = JSON.parse(
  fs.readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8')
);

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Health check: confirms the server is up and can reach the database.
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', database: 'connected' } });
  } catch {
    res.status(503).json({
      success: false,
      error: { code: ErrorCodes.SERVICE_UNAVAILABLE, message: 'Database is unreachable' },
    });
  }
});

// Interactive API documentation (Swagger UI) and the raw OpenAPI spec.
app.get('/api-docs.json', (_req, res) => res.json(openApiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
