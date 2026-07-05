import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/schema/sqlite";
import * as controlPlaneSchema from "../../src/schema/control-plane";
import createAdapters from "../../src/adapters";
import fs from "fs";
import path from "path";

function applyMigrationFolder(sqlite: Database.Database, dir: string) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const migrationSql = fs.readFileSync(path.join(dir, file), "utf-8");

    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
  }
}

export function getTestServer(options: { controlPlane?: boolean } = {}) {
  // Tests default to a control-plane database: core schema plus the
  // control-plane-only tables. Pass `{ controlPlane: false }` to model a
  // WFP tenant D1, which only carries the core migration set.
  const controlPlane = options.controlPlane ?? true;

  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, {
    schema: controlPlane ? { ...schema, ...controlPlaneSchema } : schema,
  });

  applyMigrationFolder(sqlite, path.join(__dirname, "../../drizzle"));
  if (controlPlane) {
    applyMigrationFolder(
      sqlite,
      path.join(__dirname, "../../drizzle-control-plane"),
    );
  }

  return {
    data: createAdapters(db as any, { controlPlane }),
    db,
  };
}
