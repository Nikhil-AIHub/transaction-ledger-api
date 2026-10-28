import { pool, withTransaction } from '../config/database.js';
import { transactionNotFound } from '../utils/AppError.js';
import { toTransaction } from '../utils/serializers.js';
import { assertAccountExists } from './account.service.js';
import {
  TRANSACTION_COLUMNS,
  duplicateTransactionError,
  findByReference,
  lockAccount,
  postEntry,
} from './ledger.js';

/**
 * Credit or debit an account. Inside ONE database transaction:
 *   1. lock the account row (404 if missing)
 *   2. reject a duplicate reference_id for this account (409, balance untouched)
 *   3. update the balance - debits only if funds are sufficient (422 otherwise)
 *   4. insert the transaction row
 * Any failure rolls back everything, so the balance and history can never disagree.
 */
export async function createTransaction(accountId, { type, amount, description, reference_id: referenceId }) {
  return withTransaction(async (client) => {
    const account = await lockAccount(client, accountId);

    const existing = await findByReference(client, accountId, referenceId);
    if (existing) throw duplicateTransactionError(existing);

    return postEntry(client, { account, type, amount, description, referenceId });
  });
}

export async function getTransaction(accountId, transactionId) {
  await assertAccountExists(accountId);
  const { rows } = await pool.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = $1 AND account_id = $2`,
    [transactionId, accountId]
  );
  if (rows.length === 0) throw transactionNotFound(transactionId);
  return toTransaction(rows[0]);
}

/** Latest-first history with optional type filter and page/limit pagination. */
export async function listTransactions(accountId, { type, page, limit }) {
  await assertAccountExists(accountId);

  const params = [accountId];
  let where = 'account_id = $1';
  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM transactions WHERE ${where}`, params);
  const totalRecords = countResult.rows[0].total;

  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT ${TRANSACTION_COLUMNS}
       FROM transactions
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const totalPages = Math.ceil(totalRecords / limit);
  return {
    transactions: rows.map(toTransaction),
    pagination: {
      page,
      limit,
      total_records: totalRecords,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_previous_page: page > 1,
    },
    filters: { type: type ?? null },
  };
}
