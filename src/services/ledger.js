// Low-level ledger operations. Every function here takes a `client` that is already inside
// a database transaction (see withTransaction), so callers decide the atomic boundary.

import { AppError, ErrorCodes, accountNotFound } from '../utils/AppError.js';
import { toSqlAmount, toTransaction } from '../utils/serializers.js';

const TRANSACTION_COLUMNS =
  'id, account_id, type, amount, description, reference_id, transfer_id, created_at';

/**
 * Locks the account row (SELECT ... FOR UPDATE) until the surrounding DB transaction ends.
 * Any other request touching the same account waits here, which makes concurrent debits
 * and duplicate submissions safe. Throws 404 if the account does not exist.
 */
export async function lockAccount(client, accountId) {
  const { rows } = await client.query(
    'SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE',
    [accountId]
  );
  if (rows.length === 0) throw accountNotFound(accountId);
  return rows[0];
}

export async function findByReference(client, accountId, referenceId) {
  const { rows } = await client.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE account_id = $1 AND reference_id = $2`,
    [accountId, referenceId]
  );
  return rows[0] ? toTransaction(rows[0]) : null;
}

export function duplicateTransactionError(existing) {
  return new AppError(
    409,
    ErrorCodes.DUPLICATE_TRANSACTION,
    'A transaction with this reference_id already exists for this account',
    { transaction: existing }
  );
}

export function insufficientBalanceError(accountId, currentBalance, requestedAmount) {
  return new AppError(422, ErrorCodes.INSUFFICIENT_BALANCE, 'Insufficient balance for this debit', {
    account_id: accountId,
    current_balance: currentBalance,
    requested_amount: requestedAmount,
  });
}

/**
 * Updates the balance and records the transaction row. Must be called on a locked account.
 * The balance update is conditional (balance + delta >= 0), so a debit can never overdraw.
 * Returns { transaction, balance }.
 */
export async function postEntry(client, { account, type, amount, description, referenceId, transferId = null }) {
  const delta = toSqlAmount(type === 'credit' ? amount : -amount);

  const update = await client.query(
    `UPDATE accounts
        SET balance = balance + $2::numeric
      WHERE id = $1 AND balance + $2::numeric >= 0
      RETURNING balance`,
    [account.id, delta]
  );
  if (update.rowCount === 0) throw insufficientBalanceError(account.id, account.balance, amount);

  const insert = await client.query(
    `INSERT INTO transactions (account_id, type, amount, description, reference_id, transfer_id)
     VALUES ($1, $2, $3::numeric, $4, $5, $6)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [account.id, type, toSqlAmount(amount), description ?? null, referenceId, transferId]
  );

  return { transaction: toTransaction(insert.rows[0]), balance: update.rows[0].balance };
}

export { TRANSACTION_COLUMNS };
