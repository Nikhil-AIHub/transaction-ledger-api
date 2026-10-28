import * as accountService from '../services/account.service.js';

export async function createAccount(req, res) {
  const account = await accountService.createAccount(req.validated.body);
  res.status(201).location(`/api/accounts/${account.id}`).json({ success: true, data: account });
}

export async function getAccount(req, res) {
  const account = await accountService.getAccount(req.validated.params.accountId);
  res.json({ success: true, data: account });
}

export async function getBalance(req, res) {
  const balance = await accountService.getBalance(req.validated.params.accountId);
  res.json({ success: true, data: balance });
}
