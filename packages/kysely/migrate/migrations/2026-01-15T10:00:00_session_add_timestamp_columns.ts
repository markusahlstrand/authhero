// @ts-nocheck - Migration uses temporary columns not in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Session Tables - Add Timestamp Columns (Part 1 of 2)
 *
 * This migration adds new bigint timestamp columns alongside existing varchar columns.
 * This allows the code to be updated to use the new columns before removing the old ones.
 *
 * Changes:
 * 1. Add new bigint columns (*_ts) to all session tables
 * 2. Migrate data from varchar to bigint
 * 3. Add performance indexes
 *
 * After running this migration and deploying code that uses the new columns,
 * run the second migration to remove the old varchar columns.
 */

// Helper function to detect database type
async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    // Try MySQL-specific query
    await sql`SELECT VERSION()`.execute(db);
    return "mysql";
  } catch {
    // If MySQL query fails, assume SQLite
    return "sqlite";
  }
}

// Helper to safely add a column (ignores "duplicate column" errors)
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
  columnType: "bigint",
): Promise<void> {
  try {
    await db.schema
      .alterTable(tableName)
      .addColumn(columnName, columnType)
      .execute();
  } catch (error: unknown) {
    // Ignore "duplicate column" errors (errno 1060 for MySQL, "duplicate column" for SQLite)
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
  // STEP 1: Add new bigint columns to all tables
  // ========================================

  // --- refresh_tokens ---
  await safeAddColumn(db, "refresh_tokens", "created_at_ts", "bigint");
  await safeAddColumn(db, "refresh_tokens", "expires_at_ts", "bigint");
  await safeAddColumn(db, "refresh_tokens", "idle_expires_at_ts", "bigint");
  await safeAddColumn(db, "refresh_tokens", "last_exchanged_at_ts", "bigint");

  // --- sessions ---
  await safeAddColumn(db, "sessions", "created_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "updated_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "expires_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "idle_expires_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "authenticated_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "last_interaction_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "used_at_ts", "bigint");
  await safeAddColumn(db, "sessions", "revoked_at_ts", "bigint");

  // --- login_sessions ---
  await safeAddColumn(db, "login_sessions", "created_at_ts", "bigint");
  await safeAddColumn(db, "login_sessions", "updated_at_ts", "bigint");
  await safeAddColumn(db, "login_sessions", "expires_at_ts", "bigint");

  // ========================================
  // Make old varchar columns nullable so app can use new *_ts columns
  // Note: SQLite doesn't support MODIFY COLUMN, but SQLite columns are
  // already flexible about nullability, so we skip this for SQLite
  // ========================================

  if (dbType === "mysql") {
    // --- refresh_tokens ---
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("created_at", "varchar(35)")
      .execute();
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("expires_at", "varchar(35)")
      .execute();

    // --- sessions ---
    await db.schema
      .alterTable("sessions")
      .modifyColumn("created_at", "varchar(35)")
      .execute();
    await db.schema
      .alterTable("sessions")
      .modifyColumn("updated_at", "varchar(35)")
      .execute();
    await db.schema
      .alterTable("sessions")
      .modifyColumn("expires_at", "varchar(35)")
      .execute();

    // --- login_sessions ---
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("created_at", "varchar(35)")
      .execute();
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("updated_at", "varchar(35)")
      .execute();
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("expires_at", "varchar(35)")
      .execute();
  }

  // ========================================
  // STEP 2: Add indexes for efficient cleanup (on new columns)
  // Data migration is handled by scripts/backfill-timestamps.ts separately
  // to avoid timeouts on large tables
  // ========================================

  // User ID indexes for lazy cleanup by user
  await db.schema
    .createIndex("idx_sessions_user_id")
    .on("sessions")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_user_id")
    .on("refresh_tokens")
    .columns(["tenant_id", "user_id"])
    .execute();

  // Session ID index on refresh_tokens for cleanup queries
  await db.schema
    .createIndex("idx_refresh_tokens_session_id")
    .on("refresh_tokens")
    .column("session_id")
    .execute();

  // Expires_at indexes for efficient expiration queries (on new _ts columns)
  await db.schema
    .createIndex("idx_refresh_tokens_expires_at_ts")
    .on("refresh_tokens")
    .column("expires_at_ts")
    .execute();

  await db.schema
    .createIndex("idx_sessions_expires_at_ts")
    .on("sessions")
    .column("expires_at_ts")
    .execute();

  await db.schema
    .createIndex("idx_login_sessions_expires_at_ts")
    .on("login_sessions")
    .column("expires_at_ts")
    .execute();
}

// Helper to safely drop an index (PlanetScale doesn't support IF EXISTS)
async function safeDropIndex(
  db: Kysely<Database>,
  indexName: string,
  tableName: string,
): Promise<void> {
  try {
    await db.schema.dropIndex(indexName).on(tableName).execute();
  } catch (error: unknown) {
    // Ignore "index/column doesn't exist" errors (errno 1091)
    if (error instanceof Error && error.message.includes("1091")) {
      return;
    }
    throw error;
  }
}

// Helper to safely drop a column (PlanetScale doesn't support IF EXISTS)
async function safeDropColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).dropColumn(columnName).execute();
  } catch (error: unknown) {
    // Ignore "column doesn't exist" errors (errno 1091)
    if (error instanceof Error && error.message.includes("1091")) {
      return;
    }
    throw error;
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  // ========================================
  // STEP 1: Drop indexes (if they exist)
  // ========================================
  await safeDropIndex(db, "idx_sessions_user_id", "sessions");
  await safeDropIndex(db, "idx_refresh_tokens_user_id", "refresh_tokens");
  await safeDropIndex(db, "idx_refresh_tokens_session_id", "refresh_tokens");
  await safeDropIndex(db, "idx_refresh_tokens_expires_at_ts", "refresh_tokens");
  await safeDropIndex(db, "idx_sessions_expires_at_ts", "sessions");
  await safeDropIndex(db, "idx_login_sessions_expires_at_ts", "login_sessions");

  // ========================================
  // STEP 2: Drop the new bigint columns (if they exist)
  // ========================================

  // --- refresh_tokens ---
  await safeDropColumn(db, "refresh_tokens", "created_at_ts");
  await safeDropColumn(db, "refresh_tokens", "expires_at_ts");
  await safeDropColumn(db, "refresh_tokens", "idle_expires_at_ts");
  await safeDropColumn(db, "refresh_tokens", "last_exchanged_at_ts");

  // --- sessions ---
  await safeDropColumn(db, "sessions", "created_at_ts");
  await safeDropColumn(db, "sessions", "updated_at_ts");
  await safeDropColumn(db, "sessions", "expires_at_ts");
  await safeDropColumn(db, "sessions", "idle_expires_at_ts");
  await safeDropColumn(db, "sessions", "authenticated_at_ts");
  await safeDropColumn(db, "sessions", "last_interaction_at_ts");
  await safeDropColumn(db, "sessions", "used_at_ts");
  await safeDropColumn(db, "sessions", "revoked_at_ts");

  // --- login_sessions ---
  await safeDropColumn(db, "login_sessions", "created_at_ts");
  await safeDropColumn(db, "login_sessions", "updated_at_ts");
  await safeDropColumn(db, "login_sessions", "expires_at_ts");

  // Note: NOT NULL constraints on old varchar columns are not restored
  // because MySQL doesn't support ALTER COLUMN SET NOT NULL syntax.
  // If needed, restore manually with: ALTER TABLE x MODIFY COLUMN y VARCHAR(35) NOT NULL
}
