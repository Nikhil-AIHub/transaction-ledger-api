import { Router } from 'express';
import * as accounts from '../controllers/account.controller.js';
import * as transactions from '../controllers/transaction.controller.js';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/errorHandler.js';
import { accountIdParams, createAccountBody } from '../validators/account.validator.js';
import {
  createTransactionBody,
  listTransactionsQuery,
  transactionParams,
} from '../validators/transaction.validator.js';

const router = Router();

// Accounts
router.post('/', validate({ body: createAccountBody }), accounts.createAccount);
router.get('/:accountId', validate({ params: accountIdParams }), accounts.getAccount);
router.get('/:accountId/balance', validate({ params: accountIdParams }), accounts.getBalance);

// Transactions (nested under the account they belong to)
router.post(
  '/:accountId/transactions',
  validate({ params: accountIdParams, body: createTransactionBody }),
  transactions.createTransaction
);
router.get(
  '/:accountId/transactions',
  validate({ params: accountIdParams, query: listTransactionsQuery }),
  transactions.listTransactions
);
router.get(
  '/:accountId/transactions/:transactionId',
  validate({ params: transactionParams }),
  transactions.getTransaction
);

// Immutability: transactions can never be edited or deleted through the API.
router.all(
  '/:accountId/transactions/:transactionId',
  methodNotAllowed(['GET'], 'Transactions are immutable and cannot be modified or deleted')
);

export default router;
