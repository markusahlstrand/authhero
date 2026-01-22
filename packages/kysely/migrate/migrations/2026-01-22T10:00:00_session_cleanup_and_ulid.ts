// @ts-nocheck - Migration modifies columns not in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Session Tables - Drop Old Date Columns and Increase ID Size for ULID
 *
 * This migration:
 * 1. Drops the old varchar date columns from login_sessions, sessions, and refresh_tokens
 *    (replaced by bigint _ts columns in previous migration)
 * 2. Increases the size of id columns from varchar(21) to varchar(26) to support ULIDs
 *
 * Prerequisites:
 * - The code must already be using the new _ts columns
 * - All data must have been migrated to the new columns
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

// Helper to safely drop a column (PlanetScale doesn't support IF EXISTS)
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
    // Ignore "column doesn't exist" errors (errno 1091 for MySQL, "no such column" for SQLite)
    if (errorMessage.includes("1091") || errorMessage.includes("no such column")) {
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
  // STEP 0: Drop indexes that depend on columns we're about to drop
  // ========================================
  console.log("Dropping indexes that depend on old date columns...");

  // Drop the composite index on (state, updated_at) that was created in login_session_state migration
  try {
    // Use raw SQL because Kysely's dropIndex().on() syntax doesn't work well with SQLite
    await sql`DROP INDEX IF EXISTS login_sessions_state_updated_idx`.execute(
      db,
    );
    console.log("  Dropped index login_sessions_state_updated_idx");
  } catch (error: unknown) {
    console.log(
      `  Warning: Failed to drop index login_sessions_state_updated_idx: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // ========================================
  // STEP 1: Drop old varchar date columns
  // ========================================
  console.log("Dropping old date columns...");

  // --- refresh_tokens ---
  await safeDropColumn(db, "refresh_tokens", "created_at");
  await safeDropColumn(db, "refresh_tokens", "expires_at");
  await safeDropColumn(db, "refresh_tokens", "idle_expires_at");
  await safeDropColumn(db, "refresh_tokens", "last_exchanged_at");

  // --- sessions ---
  await safeDropColumn(db, "sessions", "created_at");
  await safeDropColumn(db, "sessions", "updated_at");
  await safeDropColumn(db, "sessions", "expires_at");
  await safeDropColumn(db, "sessions", "idle_expires_at");
  await safeDropColumn(db, "sessions", "authenticated_at");
  await safeDropColumn(db, "sessions", "last_interaction_at");
  await safeDropColumn(db, "sessions", "used_at");
  await safeDropColumn(db, "sessions", "revoked_at");

  // --- login_sessions ---
  await safeDropColumn(db, "login_sessions", "created_at");
  await safeDropColumn(db, "login_sessions", "updated_at");
  await safeDropColumn(db, "login_sessions", "expires_at");

  // ========================================
  // STEP 2: Increase ID column sizes for ULID support (26 chars)
  // Note: SQLite doesn't enforce varchar length, so we only need to do this for MySQL
  // ========================================
  if (dbType === "mysql") {
    console.log("Increasing ID column sizes for ULID support...");

    // --- login_sessions ---
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("id", "varchar(26)")
      .execute();
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("session_id", "varchar(26)")
      .execute();
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("csrf_token", "varchar(26)")
      .execute();

    // --- sessions ---
    await db.schema
      .alterTable("sessions")
      .modifyColumn("id", "varchar(26)")
      .execute();
    await db.schema
      .alterTable("sessions")
      .modifyColumn("login_session_id", "varchar(26)")
      .execute();

    // --- refresh_tokens ---
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("id", "varchar(26)")
      .execute();
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("session_id", "varchar(26)")
      .execute();
  }

  console.log("Migration completed successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  // ========================================
  // STEP 1: Restore ID column sizes to varchar(21)
  // Note: This may cause data loss if ULIDs longer than 21 chars exist
  // ========================================
  if (dbType === "mysql") {
    console.log("Restoring ID column sizes to varchar(21)...");

    // --- login_sessions ---
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("id", "varchar(21)")
      .execute();
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("session_id", "varchar(21)")
      .execute();
    await db.schema
      .alterTable("login_sessions")
      .modifyColumn("csrf_token", "varchar(21)")
      .execute();

    // --- sessions ---
    await db.schema
      .alterTable("sessions")
      .modifyColumn("id", "varchar(21)")
      .execute();
    await db.schema
      .alterTable("sessions")
      .modifyColumn("login_session_id", "varchar(21)")
      .execute();

    // --- refresh_tokens ---
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("id", "varchar(21)")
      .execute();
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("session_id", "varchar(21)")
      .execute();
  }

  // ========================================
  // STEP 2: Re-add old varchar date columns
  // Note: Data cannot be restored automatically
  // ========================================
  console.log("Re-adding old date columns (data will be empty)...");

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("created_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("expires_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("idle_expires_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("last_exchanged_at", "varchar(35)")
    .execute();

  // --- sessions ---
  await db.schema
    .alterTable("sessions")
    .addColumn("created_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("updated_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("expires_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("idle_expires_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("authenticated_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("last_interaction_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("used_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("revoked_at", "varchar(35)")
    .execute();

  // --- login_sessions ---
  await db.schema
    .alterTable("login_sessions")
    .addColumn("created_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("updated_at", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("expires_at", "varchar(35)")
    .execute();

  console.log("Rollback completed");
}
