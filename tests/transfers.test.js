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
  uniqueRef,
  NON_EXISTENT_ID,
} from './helpers.js';

before(resetDatabase);
after(closeDatabase);

const transfer = (body) => api().post('/api/transfers').send(body);
const txCount = async () => (await pool.query('SELECT COUNT(*)::int AS n FROM transactions')).rows[0].n;

async function twoAccounts(balanceA, balanceB) {
  const a = await createAccount('A');
  const b = await createAccount('B');
  if (balanceA) await credit(a.id, balanceA);
  if (balanceB) await credit(b.id, balanceB);
  return [a, b];
}

describe('POST /api/transfers (bonus)', () => {
  it('moves money: A 100, B 50, transfer 30 -> A 70, B 80', async () => {
    const [a, b] = await twoAccounts(100, 50);
    const res = await transfer({ from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: 'TRF-1' });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const data = res.body.data;
    assert.deepEqual(data.from_account, { account_id: a.id, balance: 70 });
    assert.deepEqual(data.to_account, { account_id: b.id, balance: 80 });
    assert.equal(data.transactions.debit.type, 'debit');
    assert.equal(data.transactions.credit.type, 'credit');
    assert.equal(data.transactions.debit.transfer_id, data.transfer_id);
    assert.equal(data.transactions.credit.transfer_id, data.transfer_id);
    assert.equal(await getBalance(a.id), 70);
    assert.equal(await getBalance(b.id), 80);
  });

  it('both legs appear in each account history', async () => {
    const [a, b] = await twoAccounts(20, 0);
    await transfer({ from_account_id: a.id, to_account_id: b.id, amount: 5, reference_id: 'TRF-H' });
    const ha = await api().get(`/api/accounts/${a.id}/transactions?type=debit`);
    const hb = await api().get(`/api/accounts/${b.id}/transactions?type=credit`);
    assert.equal(ha.body.data[0].reference_id, 'TRF-H');
    assert.equal(hb.body.data[0].reference_id, 'TRF-H');
  });

  it('rejects insufficient balance and changes nothing', async () => {
    const [a, b] = await twoAccounts(10, 50);
    const before = await txCount();
    const res = await transfer({ from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: uniqueRef() });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'INSUFFICIENT_BALANCE');
    assert.equal(await getBalance(a.id), 10);
    assert.equal(await getBalance(b.id), 50);
    assert.equal(await txCount(), before);
  });

  it('rejects an unknown destination with 404 and leaves the source untouched', async () => {
    const [a] = await twoAccounts(100, 0);
    const res = await transfer({ from_account_id: a.id, to_account_id: NON_EXISTENT_ID, amount: 30, reference_id: uniqueRef() });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.details.account_id, NON_EXISTENT_ID);
    assert.equal(await getBalance(a.id), 100);
  });

  it('rejects an unknown source with 404', async () => {
    const [, b] = await twoAccounts(0, 10);
    const res = await transfer({ from_account_id: NON_EXISTENT_ID, to_account_id: b.id, amount: 1, reference_id: uniqueRef() });
    assert.equal(res.status, 404);
    assert.equal(await getBalance(b.id), 10);
  });

  it('rejects a transfer to the same account', async () => {
    const [a] = await twoAccounts(100, 0);
    const res = await transfer({ from_account_id: a.id, to_account_id: a.id, amount: 1, reference_id: uniqueRef() });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /different accounts/);
  });

  it('rejects a duplicate transfer reference_id without moving money twice', async () => {
    const [a, b] = await twoAccounts(100, 0);
    const body = { from_account_id: a.id, to_account_id: b.id, amount: 10, reference_id: 'TRF-DUP' };
    assert.equal((await transfer(body)).status, 201);
    const res = await transfer(body);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_TRANSACTION');
    assert.equal(await getBalance(a.id), 90);
    assert.equal(await getBalance(b.id), 10);
  });

  it('validates the body (bad ids, amount, missing reference)', async () => {
    const res = await transfer({ from_account_id: 'x', to_account_id: 'y', amount: -1 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['amount', 'from_account_id', 'reference_id', 'to_account_id']);
  });

  it('concurrent transfers in opposite directions do not deadlock and conserve money', async () => {
    const [a, b] = await twoAccounts(500, 500);
    const requests = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0
        ? transfer({ from_account_id: a.id, to_account_id: b.id, amount: 7, reference_id: uniqueRef('ab') })
        : transfer({ from_account_id: b.id, to_account_id: a.id, amount: 3, reference_id: uniqueRef('ba') })
    );
    const responses = await Promise.all(requests);

    assert.ok(responses.every((r) => r.status === 201), 'all transfers succeed');
    const [balA, balB] = [await getBalance(a.id), await getBalance(b.id)];
    assert.equal(balA + balB, 1000, 'total money is conserved');
    assert.equal(balA, 500 - 10 * 7 + 10 * 3);
  });
});
