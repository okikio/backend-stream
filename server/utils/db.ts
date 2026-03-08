import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

// Export all Drizzle operators so they are available as auto-imports in routes
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

// Export all schema tables
export * from '../db/schema';

const globalForDb = globalThis as unknown as {
  dbClient: postgres.Sql | undefined;
};

const client =
  globalForDb.dbClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {}, // silence NOTICE messages
  });

if (process.env.NODE_ENV !== 'production') globalForDb.dbClient = client;

export const db = drizzle(client, { schema });
