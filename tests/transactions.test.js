import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  pool,
  resetDatabase,
  closeDatabase,
  createAccount,
  credit,
  getBalance,
  postTransaction,
  uniqueRef,
  NON_EXISTENT_ID,
} from './helpers.js';

before(resetDatabase);
after(closeDatabase);

const countTransactions = async (accountId) =>
  (await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE account_id = $1', [accountId])).rows[0].n;

describe('Credit and debit rules', () => {
  it('credit increases the balance (100 + 50 = 150)', async () => {
    const acc = await createAccount();
    await credit(acc.id, 100);
    const res = await postTransaction(acc.id, {
      type: 'credit',
      amount: 50,
      description: 'Top-up',
      reference_id: uniqueRef(),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.balance, 150);
    const tx = res.body.data.transaction;
    assert.equal(tx.type, 'credit');
    assert.equal(tx.amount, 50);
    assert.equal(tx.description, 'Top-up');
    assert.equal(tx.account_id, acc.id);
    assert.ok(tx.id && tx.created_at && tx.reference_id);
    assert.equal(await getBalance(acc.id), 150);
  });

  it('debit decreases the balance (100 - 30 = 70)', async () => {
    const acc = await createAccount();
    await credit(acc.id, 100);
    const res = await postTransaction(acc.id, { type: 'debit', amount: 30, reference_id: uniqueRef() });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.balance, 70);
    assert.equal(await getBalance(acc.id), 70);
  });

  it('rejects a debit larger than the balance and leaves the balance unchanged', async () => {
    const acc = await createAccount();
    await credit(acc.id, 100);
    const res = await postTransaction(acc.id, { type: 'debit', amount: 150, reference_id: uniqueRef() });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'INSUFFICIENT_BALANCE');
    assert.equal(res.body.error.details.current_balance, 100);
    assert.equal(res.body.error.details.requested_amount, 150);
    assert.equal(await getBalance(acc.id), 100);
    assert.equal(await countTransactions(acc.id), 1, 'rejected debit is not recorded');
  });

  it('allows a debit of exactly the full balance', async () => {
    const acc = await createAccount();
    await credit(acc.id, 40);
    const res = await postTransaction(acc.id, { type: 'debit', amount: 40, reference_id: uniqueRef() });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.balance, 0);
  });

  it('rejects any debit on a zero-balance account', async () => {
    const acc = await createAccount();
    const res = await postTransaction(acc.id, { type: 'debit', amount: 0.01, reference_id: uniqueRef() });
    assert.equal(res.status, 422);
  });

  it('keeps the balance consistent: 0 +100 +50 -30 -20 = 100', async () => {
    const acc = await createAccount();
    for (const [type, amount] of [['credit', 100], ['credit', 50], ['debit', 30], ['debit', 20]]) {
      const res = await postTransaction(acc.id, { type, amount, reference_id: uniqueRef() });
      assert.equal(res.status, 201);
    }
    assert.equal(await getBalance(acc.id), 100);
  });

  it('uses exact decimal arithmetic (0.10 + 0.20 = 0.30)', async () => {
    const acc = await createAccount();
    await credit(acc.id, 0.1);
    await credit(acc.id, 0.2);
    assert.equal(await getBalance(acc.id), 0.3);
  });

  it('stores description as null when not provided', async () => {
    const acc = await createAccount();
    const data = await credit(acc.id, 10);
    assert.equal(data.transaction.description, null);
  });
});

describe('Duplicate reference_id', () => {
  it('does not create a second transaction or change the balance', async () => {
    const acc = await createAccount();
    const first = await postTransaction(acc.id, { type: 'credit', amount: 100, reference_id: 'INV-001' });
    assert.equal(first.status, 201);

    const second = await postTransaction(acc.id, { type: 'credit', amount: 100, reference_id: 'INV-001' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'DUPLICATE_TRANSACTION');
    assert.equal(second.body.error.details.transaction.id, first.body.data.transaction.id);

    assert.equal(await getBalance(acc.id), 100);
    assert.equal(await countTransactions(acc.id), 1);
  });

  it('is rejected even when the payload differs (type/amount)', async () => {
    const acc = await createAccount();
    await credit(acc.id, 100, 'PAY-9');
    const res = await postTransaction(acc.id, { type: 'debit', amount: 10, reference_id: 'PAY-9' });
    assert.equal(res.status, 409);
    assert.equal(await getBalance(acc.id), 100);
  });

  it('is reported as duplicate before checking the balance', async () => {
    const acc = await createAccount();
    await credit(acc.id, 10, 'DUP-FIRST');
    const res = await postTransaction(acc.id, { type: 'debit', amount: 9999, reference_id: 'DUP-FIRST' });
    assert.equal(res.status, 409);
  });

  it('allows the same reference_id on different accounts', async () => {
    const a = await createAccount('A');
    const b = await createAccount('B');
    const r1 = await postTransaction(a.id, { type: 'credit', amount: 5, reference_id: 'SHARED-REF' });
    const r2 = await postTransaction(b.id, { type: 'credit', amount: 5, reference_id: 'SHARED-REF' });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
  });

  it('treats reference_id with surrounding spaces as the same reference', async () => {
    const acc = await createAccount();
    await credit(acc.id, 1, 'TRIM-1');
    const res = await postTransaction(acc.id, { type: 'credit', amount: 1, reference_id: '  TRIM-1  ' });
    assert.equal(res.status, 409);
  });
});

describe('Validation', () => {
  let accountId;
  before(async () => {
    accountId = (await createAccount('Validator')).id;
  });

  const cases = [
    ['invalid type', { type: 'refund', amount: 10, reference_id: 'v1' }, 'INVALID_TRANSACTION_TYPE'],
    ['missing type', { amount: 10, reference_id: 'v2' }, 'INVALID_TRANSACTION_TYPE'],
    ['amount = 0', { type: 'credit', amount: 0, reference_id: 'v3' }, 'INVALID_AMOUNT'],
    ['negative amount', { type: 'credit', amount: -5, reference_id: 'v4' }, 'INVALID_AMOUNT'],
    ['amount as string', { type: 'credit', amount: '50', reference_id: 'v5' }, 'INVALID_AMOUNT'],
    ['amount with 3 decimals', { type: 'credit', amount: 1.005, reference_id: 'v6' }, 'INVALID_AMOUNT'],
    ['missing amount', { type: 'credit', reference_id: 'v7' }, 'INVALID_AMOUNT'],
    ['amount too large', { type: 'credit', amount: 1e12, reference_id: 'v8' }, 'INVALID_AMOUNT'],
    ['missing reference_id', { type: 'credit', amount: 10 }, 'VALIDATION_ERROR'],
    ['blank reference_id', { type: 'credit', amount: 10, reference_id: '  ' }, 'VALIDATION_ERROR'],
    ['unknown field', { type: 'credit', amount: 10, reference_id: 'v9', foo: 1 }, 'VALIDATION_ERROR'],
    ['several bad fields', { type: 'x', amount: -1 }, 'VALIDATION_ERROR'],
  ];

  for (const [name, body, code] of cases) {
    it(`rejects ${name} with 400 ${code}`, async () => {
      const res = await postTransaction(accountId, body);
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, code);
      assert.ok(Array.isArray(res.body.error.details) && res.body.error.details.length > 0);
    });
  }

  it('leaves the balance at 0 after all invalid requests', async () => {
    assert.equal(await getBalance(accountId), 0);
  });

  it('returns 404 when the account does not exist', async () => {
    const res = await postTransaction(NON_EXISTENT_ID, { type: 'credit', amount: 10, reference_id: 'x' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ACCOUNT_NOT_FOUND');
  });

  it('returns 400 for a malformed account id', async () => {
    const res = await postTransaction('123', { type: 'credit', amount: 10, reference_id: 'x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_ACCOUNT_ID');
  });
});

describe('Immutability', () => {
  let acc;
  let tx;
  before(async () => {
    acc = await createAccount('Immutable');
    tx = (await credit(acc.id, 25, 'IMM-1')).transaction;
  });

  it('can read a single transaction', async () => {
    const res = await api().get(`/api/accounts/${acc.id}/transactions/${tx.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, tx);
  });

  it('returns 404 for an unknown transaction', async () => {
    const res = await api().get(`/api/accounts/${acc.id}/transactions/${NON_EXISTENT_ID}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'TRANSACTION_NOT_FOUND');
  });

  for (const method of ['put', 'patch', 'delete']) {
    it(`${method.toUpperCase()} is rejected with 405`, async () => {
      const res = await api()[method](`/api/accounts/${acc.id}/transactions/${tx.id}`).send({ amount: 1 });
      assert.equal(res.status, 405);
      assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED');
      assert.equal(res.headers.allow, 'GET');
    });
  }

  it('database trigger blocks UPDATE and DELETE even outside the API', async () => {
    await assert.rejects(pool.query('UPDATE transactions SET amount = 1 WHERE id = $1', [tx.id]), /immutable/);
    await assert.rejects(pool.query('DELETE FROM transactions WHERE id = $1', [tx.id]), /immutable/);
    const res = await api().get(`/api/accounts/${acc.id}/transactions/${tx.id}`);
    assert.deepEqual(res.body.data, tx, 'transaction is unchanged');
  });

  it('database CHECK constraint prevents a negative balance', async () => {
    await assert.rejects(pool.query('UPDATE accounts SET balance = -1 WHERE id = $1', [acc.id]), /balance_non_negative/);
  });
});
