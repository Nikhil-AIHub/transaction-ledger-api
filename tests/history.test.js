import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetDatabase, closeDatabase, createAccount, postTransaction, NON_EXISTENT_ID } from './helpers.js';

let acc;
const created = []; // in creation order

before(async () => {
  await resetDatabase();
  acc = await createAccount('History');
  // 5 credits and 3 debits, interleaved, created sequentially so timestamps are increasing.
  const plan = [
    ['credit', 100], ['credit', 50], ['debit', 20], ['credit', 10],
    ['debit', 5], ['credit', 1], ['debit', 2], ['credit', 3],
  ];
  for (const [i, [type, amount]] of plan.entries()) {
    const res = await postTransaction(acc.id, { type, amount, reference_id: `H-${i + 1}` });
    assert.equal(res.status, 201);
    created.push(res.body.data.transaction);
  }
});
after(closeDatabase);

const history = (query = '', accountId = acc.id) => api().get(`/api/accounts/${accountId}/transactions${query}`);

describe('GET /api/accounts/:id/transactions', () => {
  it('returns all transactions latest-first with default pagination (page 1, limit 10)', async () => {
    const res = await history();
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.map((t) => t.reference_id),
      created.map((t) => t.reference_id).reverse()
    );
    assert.deepEqual(res.body.pagination, {
      page: 1,
      limit: 10,
      total_records: 8,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
    });
    assert.deepEqual(res.body.filters, { type: null });
  });

  it('is sorted by created_at descending', async () => {
    const res = await history();
    const times = res.body.data.map((t) => Date.parse(t.created_at));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });

  it('filters by type=credit', async () => {
    const res = await history('?type=credit');
    assert.equal(res.status, 200);
    assert.equal(res.body.pagination.total_records, 5);
    assert.ok(res.body.data.every((t) => t.type === 'credit'));
    assert.deepEqual(res.body.filters, { type: 'credit' });
  });

  it('filters by type=debit', async () => {
    const res = await history('?type=debit');
    assert.equal(res.body.pagination.total_records, 3);
    assert.deepEqual(res.body.data.map((t) => t.reference_id), ['H-7', 'H-5', 'H-3']);
  });

  it('paginates: page 2 with limit 3', async () => {
    const res = await history('?page=2&limit=3');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((t) => t.reference_id), ['H-5', 'H-4', 'H-3']);
    assert.deepEqual(res.body.pagination, {
      page: 2,
      limit: 3,
      total_records: 8,
      total_pages: 3,
      has_next_page: true,
      has_previous_page: true,
    });
  });

  it('last page contains the remaining records', async () => {
    const res = await history('?page=3&limit=3');
    assert.deepEqual(res.body.data.map((t) => t.reference_id), ['H-2', 'H-1']);
    assert.equal(res.body.pagination.has_next_page, false);
  });

  it('combines filter and pagination', async () => {
    const res = await history('?type=credit&page=2&limit=2');
    assert.deepEqual(res.body.data.map((t) => t.reference_id), ['H-4', 'H-2']);
    assert.equal(res.body.pagination.total_pages, 3);
  });

  it('returns an empty page beyond the last page', async () => {
    const res = await history('?page=99');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.pagination.total_records, 8);
  });

  it('returns an empty list for an account without transactions', async () => {
    const empty = await createAccount('Empty');
    const res = await history('', empty.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.pagination.total_pages, 0);
  });

  for (const query of ['?page=0', '?page=-1', '?page=abc', '?page=1.5', '?limit=0', '?limit=101', '?page=1&page=2']) {
    it(`rejects invalid pagination ${query} with 400 INVALID_PAGINATION`, async () => {
      const res = await history(query);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_PAGINATION');
    });
  }

  it('rejects an invalid type filter with 400 INVALID_TRANSACTION_TYPE', async () => {
    const res = await history('?type=refund');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_TRANSACTION_TYPE');
  });

  it('returns 404 for an unknown account', async () => {
    const res = await history('', NON_EXISTENT_ID);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ACCOUNT_NOT_FOUND');
  });
});
