import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/schema/sqlite";
import createAdapters from "../../src/adapters";
import fs from "fs";
import path from "path";

export function getTestServer() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // Apply the migration
  const migrationDir = path.join(__dirname, "../../drizzle");
  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const migrationSql = fs.readFileSync(
      path.join(migrationDir, file),
      "utf-8",
    );

    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
  }

  return {
    data: createAdapters(db as any),
    db,
  };
}
