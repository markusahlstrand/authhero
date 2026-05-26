import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "../../src/db";
import createAdapters, { migrateToLatest } from "../../src";
import { afterEach } from "vitest";

type getEnvParams = {
  testTenantLanguage?: string;
  emailValidation?: "enabled" | "enforced" | "disabled";
};

// Cache the schema-only SQLite image so the migrations only run once per
// worker process. Subsequent `getTestServer()` calls instantiate a fresh
// in-memory DB directly from the serialized buffer (microseconds) rather
// than re-running the full migration chain.
let cachedSchemaImage: Buffer | null = null;

async function getMigratedSchemaImage(): Promise<Buffer> {
  if (cachedSchemaImage) return cachedSchemaImage;
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);
  // Serialize BEFORE destroying the Kysely wrapper — Kysely.destroy() closes
  // the underlying SQLite connection, after which serialize() throws
  // "database connection is not open".
  cachedSchemaImage = sqlite.serialize();
  await db.destroy();
  return cachedSchemaImage;
}

export async function getTestServer(args: getEnvParams = {}) {
  const sqlite = new SQLite(await getMigratedSchemaImage());
  const dialect = new SqliteDialect({ database: sqlite });
  const db = new Kysely<Database>({ dialect });
  // Schema is already present from the cached image — no migration call.

  return {
    data: createAdapters(db),
    db,
  };
}

export async function setupTestDb() {
  const { data, db } = await getTestServer();

  afterEach(async () => {
    await data.sessionCleanup!();
  });

  return { db, adapters: data };
}
