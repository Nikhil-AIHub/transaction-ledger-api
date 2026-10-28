import * as transactionService from '../services/transaction.service.js';

export async function createTransaction(req, res) {
  const { accountId } = req.validated.params;
  const { transaction, balance } = await transactionService.createTransaction(accountId, req.validated.body);
  res
    .status(201)
    .location(`/api/accounts/${accountId}/transactions/${transaction.id}`)
    .json({ success: true, data: { transaction, balance } });
}

export async function listTransactions(req, res) {
  const { accountId } = req.validated.params;
  const result = await transactionService.listTransactions(accountId, req.validated.query);
  res.json({
    success: true,
    data: result.transactions,
    pagination: result.pagination,
    filters: result.filters,
  });
}

export async function getTransaction(req, res) {
  const { accountId, transactionId } = req.validated.params;
  const transaction = await transactionService.getTransaction(accountId, transactionId);
  res.json({ success: true, data: transaction });
}
