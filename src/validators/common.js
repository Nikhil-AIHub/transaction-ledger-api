import { z } from 'zod';

export const MAX_AMOUNT = 1_000_000_000; // 1 billion per transaction

export const uuidParam = (field) =>
  z.uuid({ error: `${field} must be a valid UUID` });

/** Positive number, at most 2 decimal places, bounded. Strings like "50" are rejected on purpose. */
export const amountSchema = z
  .number({
    error: (issue) => (issue.input === undefined ? 'amount is required' : 'amount must be a number'),
  })
  .refine(Number.isFinite, { error: 'amount must be a finite number' })
  .refine((v) => v > 0, { error: 'amount must be greater than 0' })
  .refine((v) => v <= MAX_AMOUNT, { error: `amount must not exceed ${MAX_AMOUNT}` })
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    error: 'amount must have at most 2 decimal places',
  });

export const referenceIdSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'reference_id is required' : 'reference_id must be a string'),
  })
  .trim()
  .min(1, { error: 'reference_id must not be empty' })
  .max(100, { error: 'reference_id must be at most 100 characters' });

export const descriptionSchema = z
  .string({ error: 'description must be a string' })
  .trim()
  .max(500, { error: 'description must be at most 500 characters' })
  .nullable()
  .optional();
