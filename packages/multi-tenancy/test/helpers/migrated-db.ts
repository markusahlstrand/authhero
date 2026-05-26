import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database, migrateToLatest } from "@authhero/kysely-adapter";

/**
 * Returns a fresh in-memory Kysely client with the full migration chain
 * already applied. The migration sequence (171+ migrations) runs only once
 * per worker — the schema-only image is serialized into a buffer and
 * rehydrated on each subsequent call (microseconds vs ~340 ms per
 * `migrateToLatest`).
 *
 * Use this in `beforeEach` blocks instead of calling
 * `new SQLite(":memory:")` + `migrateToLatest(db)` by hand.
 */
let cachedSchemaImage: Buffer | null = null;

async function getMigratedSchemaImage(): Promise<Buffer> {
  if (cachedSchemaImage) return cachedSchemaImage;
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);
  // Serialize before destroying — Kysely.destroy() closes the underlying
  // SQLite connection, after which serialize() throws.
  cachedSchemaImage = sqlite.serialize();
  await db.destroy();
  return cachedSchemaImage;
}

export async function createMigratedDb(): Promise<Kysely<Database>> {
  const sqlite = new SQLite(await getMigratedSchemaImage());
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}
