import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// Migrations are pre-generated and shipped with the @authhero/drizzle package.
// The schema is managed by AuthHero — do not generate your own migrations.
const migrationsFolder = "node_modules/@authhero/drizzle/drizzle";

function migrateDb() {
  const sqlite = new Database("db.sqlite");
  const db = drizzle(sqlite);

  console.log("Running migrations...");

  try {
    migrate(db, { migrationsFolder });
    console.log("✅ All migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

migrateDb();
