import { AppError, ErrorCodes } from '../utils/AppError.js';

// When every failing field belongs to one category, a more specific error code is used.
const FIELD_ERROR_CODES = {
  accountId: ErrorCodes.INVALID_ACCOUNT_ID,
  from_account_id: ErrorCodes.INVALID_ACCOUNT_ID,
  to_account_id: ErrorCodes.INVALID_ACCOUNT_ID,
  type: ErrorCodes.INVALID_TRANSACTION_TYPE,
  amount: ErrorCodes.INVALID_AMOUNT,
  page: ErrorCodes.INVALID_PAGINATION,
  limit: ErrorCodes.INVALID_PAGINATION,
};

const SERVER_MANAGED_FIELDS = new Set(['id', 'balance', 'created_at', 'account_id', 'transfer_id']);

function toDetails(issues, location) {
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        location,
        field: key,
        message: SERVER_MANAGED_FIELDS.has(key)
          ? `${key} is set by the server and cannot be provided by the client`
          : `${key} is not an allowed field`,
      }));
    }
    return [{ location, field: issue.path.join('.') || null, message: issue.message }];
  });
}

/**
 * validate({ params, query, body }) - each value is a Zod schema.
 * On success the parsed (trimmed, defaulted, type-converted) values are put on req.validated.
 * On failure a 400 error is raised listing every problem found.
 */
export const validate = (schemas) => (req, _res, next) => {
  const details = [];
  req.validated = {};

  for (const location of ['params', 'query', 'body']) {
    const schema = schemas[location];
    if (!schema) continue;
    const result = schema.safeParse(req[location]);
    if (result.success) {
      req.validated[location] = result.data;
    } else {
      details.push(...toDetails(result.error.issues, location));
    }
  }

  if (details.length === 0) return next();

  const codes = new Set(details.map((d) => FIELD_ERROR_CODES[d.field] ?? ErrorCodes.VALIDATION_ERROR));
  const code = codes.size === 1 ? [...codes][0] : ErrorCodes.VALIDATION_ERROR;
  const message = details.length === 1 ? details[0].message : 'Request validation failed';
  next(new AppError(400, code, message, details));
};
