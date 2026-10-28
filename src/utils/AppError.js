/**
 * An expected, client-facing error. The error handler turns it into:
 * { success: false, error: { code, message, details? } } with the given HTTP status.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const ErrorCodes = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_ACCOUNT_ID: 'INVALID_ACCOUNT_ID',
  INVALID_TRANSACTION_TYPE: 'INVALID_TRANSACTION_TYPE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_PAGINATION: 'INVALID_PAGINATION',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
});

export const accountNotFound = (accountId) =>
  new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, 'Account not found', { account_id: accountId });

export const transactionNotFound = (transactionId) =>
  new AppError(404, ErrorCodes.TRANSACTION_NOT_FOUND, 'Transaction not found', {
    transaction_id: transactionId,
  });
