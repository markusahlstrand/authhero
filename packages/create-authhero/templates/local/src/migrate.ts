import { SqliteDialect, Kysely } from "kysely";
import Database from "better-sqlite3";
import { migrateToLatest } from "@authhero/kysely-adapter";

async function migrate() {
  const dialect = new SqliteDialect({
    database: new Database("db.sqlite"),
  });

  const db = new Kysely<any>({ dialect });

  console.log("Running migrations...");

  try {
    await migrateToLatest(db, true);
    console.log("✅ All migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

migrate();
