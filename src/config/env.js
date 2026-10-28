import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isTest = process.env.NODE_ENV === 'test';

// Tests run against a separate database so they never wipe development data.
const databaseUrl = isTest
  ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and fill in your PostgreSQL connection string.'
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest,
  port: Number(process.env.PORT) || 3000,
  databaseUrl,
};
