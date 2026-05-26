import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";

type getEnvParams = {
  testTenantLanguage?: string;
  emailValidation?: "enabled" | "enforced" | "disabled";
};

// Cache the schema-only SQLite image so the migrations only run once per
// worker process. See packages/authhero/test/helpers/test-server.ts for the
// rationale.
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

export async function getTestServer(args: getEnvParams = {}) {
  const sqlite = new SQLite(await getMigratedSchemaImage());
  const dialect = new SqliteDialect({ database: sqlite });
  const db = new Kysely<Database>({ dialect });

  return {
    data: createAdapters(db),
    db,
  };
}
