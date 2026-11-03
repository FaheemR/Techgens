import { createDb, runMigrations, type DbHandle } from "./index";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://techgens:techgens@127.0.0.1:55432/techgens";

/** Fresh, migrated database for an integration test file (drops all Techgens + pg-boss state). */
export async function createTestDb(): Promise<DbHandle> {
  const handle = createDb(TEST_DATABASE_URL, { max: 5 });
  await handle.pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS pgboss CASCADE;
    CREATE SCHEMA public;
  `);
  await runMigrations(handle.db);
  return handle;
}
