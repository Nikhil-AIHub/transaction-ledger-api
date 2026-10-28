import { z } from 'zod';
import { amountSchema, descriptionSchema, referenceIdSchema, uuidParam } from './common.js';

export const createTransferBody = z
  .object(
    {
      from_account_id: uuidParam('from_account_id'),
      to_account_id: uuidParam('to_account_id'),
      amount: amountSchema,
      description: descriptionSchema,
      reference_id: referenceIdSchema,
    },
    { error: 'Request body must be a JSON object' }
  )
  .strict()
  .refine((body) => body.from_account_id !== body.to_account_id, {
    error: 'from_account_id and to_account_id must be different accounts',
    path: ['to_account_id'],
  });
