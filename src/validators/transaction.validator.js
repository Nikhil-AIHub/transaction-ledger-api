import { z } from 'zod';
import { amountSchema, descriptionSchema, referenceIdSchema, uuidParam } from './common.js';

export const TRANSACTION_TYPES = ['credit', 'debit'];

const transactionType = z.enum(TRANSACTION_TYPES, {
  error: (issue) =>
    issue.input === undefined ? 'type is required' : "type must be either 'credit' or 'debit'",
});

export const createTransactionBody = z
  .object(
    {
      type: transactionType,
      amount: amountSchema,
      description: descriptionSchema,
      reference_id: referenceIdSchema,
    },
    { error: 'Request body must be a JSON object' }
  )
  .strict();

export const transactionParams = z.object({
  accountId: uuidParam('accountId'),
  transactionId: uuidParam('transactionId'),
});

export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;

// Query-string values arrive as strings. Only plain positive integers ("1", "25") are accepted;
// "0", "-1", "1.5", "abc" or repeated parameters (?page=1&page=2) are rejected.
const positiveIntQuery = (field) =>
  z
    .string({ error: `${field} must be a positive integer` })
    .regex(/^[1-9]\d*$/, { error: `${field} must be a positive integer` })
    .transform(Number);

export const listTransactionsQuery = z.object({
  type: z
    .enum(TRANSACTION_TYPES, { error: "type must be either 'credit' or 'debit'" })
    .optional(),
  page: positiveIntQuery('page').default(1),
  limit: positiveIntQuery('limit')
    .refine((n) => n <= MAX_PAGE_LIMIT, { error: `limit must not exceed ${MAX_PAGE_LIMIT}` })
    .default(DEFAULT_PAGE_LIMIT),
});
