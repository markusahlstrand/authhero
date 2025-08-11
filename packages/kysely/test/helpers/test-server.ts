import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "../../src/db";
import createAdapters, { migrateToLatest } from "../../src";
import { afterEach } from "vitest";

type getEnvParams = {
  testTenantLanguage?: string;
  emailValidation?: "enabled" | "enforced" | "disabled";
};

export async function getTestServer(args: getEnvParams = {}) {
  const dialect = new SqliteDialect({
    database: new SQLite(":memory:"),
  });

  // Don't use getDb here as it will reuse the connection
  const db = new Kysely<Database>({ dialect: dialect });

  await migrateToLatest(db, false);

  return {
    data: createAdapters(db),
    db,
  };
}

export async function setupTestDb() {
  const { data, db } = await getTestServer();

  afterEach(async () => {
    await data.cleanup();
  });

  return { db, adapters: data };
}
