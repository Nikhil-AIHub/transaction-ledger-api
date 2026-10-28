// Convert database rows into the JSON shapes the API returns (snake_case, ISO timestamps).

export const toAccount = (row) => ({
  id: row.id,
  name: row.name,
  balance: row.balance,
  created_at: row.created_at.toISOString(),
});

export const toTransaction = (row) => ({
  id: row.id,
  account_id: row.account_id,
  type: row.type,
  amount: row.amount,
  description: row.description,
  reference_id: row.reference_id,
  transfer_id: row.transfer_id,
  created_at: row.created_at.toISOString(),
});

/** Amounts are passed to SQL as strings with exactly 2 decimals, so PostgreSQL does exact decimal math. */
export const toSqlAmount = (amount) => amount.toFixed(2);
