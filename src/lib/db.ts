import 'server-only';

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

export function getDb() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for configured Student Web storage.');
  }
  return neon(databaseUrl);
}

export const isDbConfigured = Boolean(databaseUrl);
