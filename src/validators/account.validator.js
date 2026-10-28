import { z } from 'zod';
import { uuidParam } from './common.js';

export const createAccountBody = z
  .object(
    {
      name: z
        .string({
          error: (issue) => (issue.input === undefined ? 'name is required' : 'name must be a string'),
        })
        .trim()
        .min(1, { error: 'name must not be empty' })
        .max(255, { error: 'name must be at most 255 characters' }),
    },
    { error: 'Request body must be a JSON object' }
  )
  // .strict() rejects unknown fields - this is how the client is prevented from setting
  // balance, id or created_at.
  .strict();

export const accountIdParams = z.object({ accountId: uuidParam('accountId') });
