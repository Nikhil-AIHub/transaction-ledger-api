import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  pool,
  resetDatabase,
  closeDatabase,
  createAccount,
  credit,
  getBalance,
  postTransaction,
  uniqueRef,
} from './helpers.js';
import { withTransaction } from '../src/config/database.js';
import { lockAccount, postEntry } from '../src/services/ledger.js';

before(resetDatabase);
after(closeDatabase);

const statusCounts = (responses) =>
  responses.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

/** Balance must always equal sum(credits) - sum(debits) recorded for the account. */
async function ledgerSum(accountId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS total
       FROM transactions WHERE account_id = $1`,
    [accountId]
  );
  return rows[0].total;
}

describe('Concurrency and atomicity', () => {
  it('20 simultaneous debits of 10 on a balance of 100: exactly 10 succeed, never overdrawn', async () => {
    const acc = await createAccount('Race');
    await credit(acc.id, 100);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        postTransaction(acc.id, { type: 'debit', amount: 10, reference_id: uniqueRef('race') })
      )
    );

    assert.deepEqual(statusCounts(responses), { 201: 10, 422: 10 });
    assert.equal(await getBalance(acc.id), 0);
    assert.equal(await ledgerSum(acc.id), 0);
  });

  it('10 simultaneous requests with the same reference_id create exactly one transaction', async () => {
    const acc = await createAccount('Dupes');
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        postTransaction(acc.id, { type: 'credit', amount: 25, reference_id: 'SAME-REF' })
      )
    );

    assert.deepEqual(statusCounts(responses), { 201: 1, 409: 9 });
    assert.equal(await getBalance(acc.id), 25);
  });

  it('mixed concurrent credits and debits keep balance == sum of recorded transactions', async () => {
    const acc = await createAccount('Mixed');
    await credit(acc.id, 50);
    const requests = Array.from({ length: 30 }, (_, i) =>
      postTransaction(acc.id, {
        type: i % 2 === 0 ? 'credit' : 'debit',
        amount: (i % 7) + 1,
        reference_id: uniqueRef('mix'),
      })
    );
    await Promise.all(requests);

    const balance = await getBalance(acc.id);
    assert.equal(balance, await ledgerSum(acc.id));
    assert.ok(balance >= 0);
  });

  it('rolls back the balance update if a later step in the same DB transaction fails', async () => {
    const acc = await createAccount('Rollback');
    await credit(acc.id, 100);

    await assert.rejects(
      withTransaction(async (client) => {
        const locked = await lockAccount(client, acc.id);
        await postEntry(client, { account: locked, type: 'debit', amount: 60, referenceId: uniqueRef() });
        throw new Error('simulated failure after the debit was written');
      }),
      /simulated failure/
    );

    assert.equal(await getBalance(acc.id), 100, 'balance unchanged');
    assert.equal(await ledgerSum(acc.id), 100, 'no transaction row persisted');
  });
});
