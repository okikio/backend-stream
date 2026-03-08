#!/usr/bin/env node
/**
 * Database migration runner.
 * Applies all pending Drizzle migrations from the ./drizzle folder.
 *
 * Usage:  node scripts/migrate.mjs
 * Env:    DATABASE_URL  (required)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

// Dedicated single-connection client for migrations (avoids pooling issues)
// onnotice suppresses benign NOTICE messages from CREATE IF NOT EXISTS statements
const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const db = drizzle(client);

const migrationsFolder = join(__dirname, '..', 'drizzle');

console.log('[migrate] Running database migrations…');
try {
  await migrate(db, { migrationsFolder });
  console.log('[migrate] All migrations applied successfully.');
} catch (err) {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
