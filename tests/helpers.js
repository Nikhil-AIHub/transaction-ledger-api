import './setup.js';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';

export { app, pool };
export const api = () => request(app);

/** Ensures the schema exists and empties all tables. */
export async function resetDatabase() {
  await runMigrations(pool, { log: () => {} });
  await pool.query('TRUNCATE transactions, accounts RESTART IDENTITY CASCADE');
}

export async function closeDatabase() {
  await pool.end();
}

export async function createAccount(name = 'Test User') {
  const res = await api().post('/api/accounts').send({ name });
  if (res.status !== 201) throw new Error(`createAccount failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

let refCounter = 0;
export const uniqueRef = (prefix = 'ref') => `${prefix}-${Date.now()}-${++refCounter}`;

export function postTransaction(accountId, body) {
  return api().post(`/api/accounts/${accountId}/transactions`).send(body);
}

export async function credit(accountId, amount, referenceId = uniqueRef('cr')) {
  const res = await postTransaction(accountId, { type: 'credit', amount, reference_id: referenceId });
  if (res.status !== 201) throw new Error(`credit failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function getBalance(accountId) {
  const res = await api().get(`/api/accounts/${accountId}/balance`);
  return res.body.data.balance;
}

export const NON_EXISTENT_ID = '00000000-0000-4000-8000-000000000000';
