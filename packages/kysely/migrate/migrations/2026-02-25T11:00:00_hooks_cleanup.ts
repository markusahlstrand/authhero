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
