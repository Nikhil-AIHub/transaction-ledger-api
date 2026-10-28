import { randomUUID } from 'node:crypto';
import { withTransaction } from '../config/database.js';
import { duplicateTransactionError, findByReference, lockAccount, postEntry } from './ledger.js';

/**
 * Moves money between two accounts as ONE database transaction:
 * debit source + credit destination either both happen or neither does.
 *
 * Both rows are locked in a fixed order (sorted by id). If two transfers run in opposite
 * directions at the same time (A->B and B->A), they lock in the same order and therefore
 * cannot deadlock each other.
 */
export async function createTransfer({
  from_account_id: fromId,
  to_account_id: toId,
  amount,
  description,
  reference_id: referenceId,
}) {
  return withTransaction(async (client) => {
    const [firstId, secondId] = [fromId, toId].sort();
    const locked = {};
    locked[firstId] = await lockAccount(client, firstId);
    locked[secondId] = await lockAccount(client, secondId);
    const source = locked[fromId];
    const destination = locked[toId];

    // reference_id is recorded on both legs, so it must be unused on both accounts.
    for (const accountId of [fromId, toId]) {
      const existing = await findByReference(client, accountId, referenceId);
      if (existing) throw duplicateTransactionError(existing);
    }

    const transferId = randomUUID();

    const debit = await postEntry(client, {
      account: source,
      type: 'debit',
      amount,
      description: description ?? `Transfer to account ${toId}`,
      referenceId,
      transferId,
    });

    const credit = await postEntry(client, {
      account: destination,
      type: 'credit',
      amount,
      description: description ?? `Transfer from account ${fromId}`,
      referenceId,
      transferId,
    });

    return {
      transfer_id: transferId,
      amount,
      reference_id: referenceId,
      from_account: { account_id: fromId, balance: debit.balance },
      to_account: { account_id: toId, balance: credit.balance },
      transactions: { debit: debit.transaction, credit: credit.transaction },
    };
  });
}
