// @ts-nocheck - Migration modifies columns not in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Hooks Table - Drop old columns and fix column types (Part 2 of 2)
 *
 * Prerequisites:
 * - Part 1 migration must have run (added _ts columns, template_id)
 * - Code must already be using the new _ts columns
 * - All data must have been migrated to the new columns
 *
 * Changes:
 * 1. Drop old varchar date columns (created_at, updated_at)
 * 2. Fix hook_id column type from varchar(255) to varchar(21)
 * 3. Fix form_id column type from text to varchar(128)
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

// Helper to safely drop a column
async function safeDropColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).dropColumn(columnName).execute();
    console.log(`  Dropped column ${tableName}.${columnName}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("1091") ||
      errorMessage.includes("no such column")
    ) {
      console.log(
        `  Column ${tableName}.${columnName} doesn't exist, skipping`,
      );
      return;
    }
    throw error;
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  // ========================================
  // PREFLIGHT: Verify all rows have valid _ts columns before dropping legacy columns
  // ========================================
  console.log("Running preflight integrity check on hooks timestamp columns...");

  const { rows: nullCheck } = await sql<{
    null_created: number;
    null_updated: number;
  }>`SELECT
      SUM(CASE WHEN created_at_ts IS NULL THEN 1 ELSE 0 END) AS null_created,
      SUM(CASE WHEN updated_at_ts IS NULL THEN 1 ELSE 0 END) AS null_updated
    FROM hooks`.execute(db);

  const nullCreated = Number(nullCheck[0]?.null_created ?? 0);
  const nullUpdated = Number(nullCheck[0]?.null_updated ?? 0);

  if (nullCreated > 0 || nullUpdated > 0) {
    throw new Error(
      `Preflight check failed: ${nullCreated} row(s) with NULL created_at_ts, ` +
        `${nullUpdated} row(s) with NULL updated_at_ts. ` +
        `All timestamp data must be migrated to _ts columns before dropping legacy columns.`,
    );
  }

  console.log("  Preflight check passed — all _ts columns are populated.");

  // ========================================
  // STEP 1: Drop old varchar date columns
  // ========================================
  console.log("Dropping old date columns from hooks...");
  await safeDropColumn(db, "hooks", "created_at");
  await safeDropColumn(db, "hooks", "updated_at");

  // ========================================
  // STEP 2: Fix column types (MySQL only - SQLite doesn't support MODIFY COLUMN)
  // ========================================
  if (dbType === "mysql") {
    console.log("Fixing hook column types...");

    // hook_id: varchar(255) -> varchar(21) (nanoid with h_ prefix = 19 chars, 21 gives headroom)
    await db.schema
      .alterTable("hooks")
      .modifyColumn("hook_id", "varchar(21)", (col) =>
        col.notNull().primaryKey(),
      )
      .execute();

    // form_id: text -> varchar(128)
    await db.schema
      .alterTable("hooks")
      .modifyColumn("form_id", "varchar(128)")
      .execute();

    // template_id: text -> varchar(64)
    await db.schema
      .alterTable("hooks")
      .modifyColumn("template_id", "varchar(64)")
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  // Re-add the old varchar date columns
  await db.schema
    .alterTable("hooks")
    .addColumn("created_at", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("hooks")
    .addColumn("updated_at", "varchar(255)")
    .execute();

  // Repopulate legacy columns from _ts columns so rollback restores data
  if (dbType === "mysql") {
    // Convert epoch milliseconds back to ISO 8601 strings
    await sql`
      UPDATE hooks
      SET created_at = DATE_FORMAT(FROM_UNIXTIME(created_at_ts / 1000), '%Y-%m-%dT%H:%i:%s.000Z'),
          updated_at = DATE_FORMAT(FROM_UNIXTIME(updated_at_ts / 1000), '%Y-%m-%dT%H:%i:%s.000Z')
      WHERE created_at_ts IS NOT NULL
    `.execute(db);
  } else {
    // SQLite: convert epoch milliseconds back to ISO 8601 strings
    await sql`
      UPDATE hooks
      SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at_ts / 1000, 'unixepoch'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at_ts / 1000, 'unixepoch')
      WHERE created_at_ts IS NOT NULL
    `.execute(db);
  }

  // Revert column types (MySQL only)
  if (dbType === "mysql") {
    await db.schema
      .alterTable("hooks")
      .modifyColumn("hook_id", "varchar(255)", (col) =>
        col.notNull().primaryKey(),
      )
      .execute();

    await db.schema
      .alterTable("hooks")
      .modifyColumn("form_id", "text")
      .execute();

    await db.schema
      .alterTable("hooks")
      .modifyColumn("template_id", "text")
      .execute();
  }
}
