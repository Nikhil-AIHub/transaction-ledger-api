import { AppError, ErrorCodes } from '../utils/AppError.js';
import { env } from '../config/env.js';

// PostgreSQL error codes we translate into friendly API errors (safety nets behind app-level checks).
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

function translate(err) {
  if (err instanceof AppError) return err;

  // Malformed JSON body (thrown by express.json()).
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, ErrorCodes.INVALID_JSON, 'Request body contains invalid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, ErrorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }
  if (err.code === PG_UNIQUE_VIOLATION && err.constraint === 'transactions_account_reference_unique') {
    return new AppError(409, ErrorCodes.DUPLICATE_TRANSACTION, 'A transaction with this reference_id already exists for this account');
  }
  if (err.code === PG_CHECK_VIOLATION && err.constraint === 'accounts_balance_non_negative') {
    return new AppError(422, ErrorCodes.INSUFFICIENT_BALANCE, 'Insufficient balance');
  }
  return null;
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, ErrorCodes.ROUTE_NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found`));
}

export function methodNotAllowed(allowed, message) {
  return (req, res, next) => {
    res.set('Allow', allowed.join(', '));
    next(new AppError(405, ErrorCodes.METHOD_NOT_ALLOWED, message ?? `Method ${req.method} is not allowed on this resource`));
  };
}

// Express recognises error handlers by their 4 arguments, so `next` must stay in the signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const appError = translate(err);

  if (!appError) {
    if (!env.isTest) console.error('Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: { code: ErrorCodes.INTERNAL_SERVER_ERROR, message: 'An unexpected error occurred' },
    });
  }

  const body = { success: false, error: { code: appError.code, message: appError.message } };
  if (appError.details !== undefined) body.error.details = appError.details;
  res.status(appError.statusCode).json(body);
}
