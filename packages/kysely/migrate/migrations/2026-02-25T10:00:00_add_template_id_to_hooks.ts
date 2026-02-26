// @ts-nocheck - Migration uses temporary columns not in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Hooks Table - Add template_id, timestamp columns, and fix column types (Part 1 of 2)
 *
 * Changes:
 * 1. Add template_id column for template-type hooks
 * 2. Add bigint timestamp columns (created_at_ts, updated_at_ts) alongside existing varchar columns
 * 3. Migrate existing date data to new _ts columns
 *
 * After deploying code that uses the new columns, run Part 2 to drop old varchar columns.
 */

// Helper function to detect database type
async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    await sql`SELECT VERSION()`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

// Helper to safely add a column (ignores "duplicate column" errors)
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
  columnType: string,
): Promise<void> {
  try {
    await db.schema
      .alterTable(tableName)
      .addColumn(columnName, sql.raw(columnType))
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1060") ||
        error.message.includes("duplicate column"))
    ) {
      console.log(
        `  Column ${tableName}.${columnName} already exists, skipping`,
      );
      return;
    }
    throw error;
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  // ========================================
  // STEP 1: Add template_id column
  // ========================================
  await safeAddColumn(db, "hooks", "template_id", "text");

  // ========================================
  // STEP 2: Add new bigint timestamp columns
  // ========================================
  await safeAddColumn(db, "hooks", "created_at_ts", "bigint");
  await safeAddColumn(db, "hooks", "updated_at_ts", "bigint");

  // ========================================
  // STEP 3: Migrate existing date data to new _ts columns
  // ========================================
  if (dbType === "mysql") {
    // MySQL: Use UNIX_TIMESTAMP to convert ISO strings to milliseconds
    await sql`
      UPDATE hooks
      SET created_at_ts = UNIX_TIMESTAMP(created_at) * 1000,
          updated_at_ts = UNIX_TIMESTAMP(updated_at) * 1000
      WHERE created_at_ts IS NULL AND created_at IS NOT NULL
    `.execute(db);
  } else {
    // SQLite: Use strftime to convert ISO strings to milliseconds
    await sql`
      UPDATE hooks
      SET created_at_ts = CAST(strftime('%s', created_at) AS INTEGER) * 1000,
          updated_at_ts = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
      WHERE created_at_ts IS NULL AND created_at IS NOT NULL
    `.execute(db);
  }

  // ========================================
  // STEP 4: Make old varchar columns nullable (MySQL only, SQLite is already flexible)
  // ========================================
  if (dbType === "mysql") {
    await db.schema
      .alterTable("hooks")
      .modifyColumn("created_at", "varchar(255)")
      .execute();
    await db.schema
      .alterTable("hooks")
      .modifyColumn("updated_at", "varchar(255)")
      .execute();
  }
}

// Helper to safely drop a column
async function safeDropColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).dropColumn(columnName).execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1091") ||
        error.message.includes("no such column"))
    ) {
      return;
    }
    throw error;
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await safeDropColumn(db, "hooks", "template_id");
  await safeDropColumn(db, "hooks", "created_at_ts");
  await safeDropColumn(db, "hooks", "updated_at_ts");
}
