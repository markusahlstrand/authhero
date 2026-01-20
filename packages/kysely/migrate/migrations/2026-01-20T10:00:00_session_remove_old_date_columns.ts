// @ts-nocheck - Migration uses temporary columns not in the Database type
import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Session Tables - Remove Old Date Columns (Part 2 of 2)
 *
 * This migration removes the old varchar date columns from the session tables
 * now that the new _ts bigint columns are in use.
 *
 * Prerequisites:
 * - The first migration (2026-01-15T10:00:00_session_add_timestamp_columns) must be applied
 * - The application code must be deployed and using the new _ts columns
 *
 * Changes:
 * 1. Drop old varchar date columns
 * 2. Add indexes for efficient cleanup and expiration queries
 */

/**
 * Convert Unix timestamp in milliseconds to ISO date string.
 */
function timestampToIso(
  timestamp: number | bigint | string | null | undefined,
): string | null {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }
  const numValue =
    typeof timestamp === "bigint"
      ? Number(timestamp)
      : typeof timestamp === "string"
        ? parseInt(timestamp, 10)
        : timestamp;

  if (Number.isNaN(numValue)) {
    return null;
  }
  return new Date(numValue).toISOString();
}

const BATCH_SIZE = 1000;

export async function up(db: Kysely<Database>): Promise<void> {
  // ========================================
  // STEP 1: Drop old varchar columns
  // ========================================

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("created_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("expires_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("idle_expires_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("last_exchanged_at")
    .execute();

  // --- sessions ---
  await db.schema.alterTable("sessions").dropColumn("created_at").execute();
  await db.schema.alterTable("sessions").dropColumn("updated_at").execute();
  await db.schema.alterTable("sessions").dropColumn("expires_at").execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("idle_expires_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("authenticated_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("last_interaction_at")
    .execute();
  await db.schema.alterTable("sessions").dropColumn("used_at").execute();
  await db.schema.alterTable("sessions").dropColumn("revoked_at").execute();

  // --- login_sessions ---
  // Drop index that references updated_at before dropping the column
  await db.schema.dropIndex("login_sessions_state_updated_idx").execute();

  await db.schema
    .alterTable("login_sessions")
    .dropColumn("created_at")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("updated_at")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("expires_at")
    .execute();

  // ========================================
  // STEP 2: Add indexes for efficient cleanup
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

  // Expires_at indexes for efficient expiration queries
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

  // Recreate the state_updated index using the new _ts column
  await db.schema
    .createIndex("login_sessions_state_updated_idx")
    .on("login_sessions")
    .columns(["state", "updated_at_ts"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // ========================================
  // STEP 1: Drop indexes
  // ========================================
  await db.schema.dropIndex("idx_sessions_user_id").on("sessions").execute();
  await db.schema
    .dropIndex("idx_refresh_tokens_user_id")
    .on("refresh_tokens")
    .execute();
  await db.schema
    .dropIndex("idx_refresh_tokens_session_id")
    .on("refresh_tokens")
    .execute();
  await db.schema
    .dropIndex("idx_refresh_tokens_expires_at_ts")
    .on("refresh_tokens")
    .execute();
  await db.schema
    .dropIndex("idx_sessions_expires_at_ts")
    .on("sessions")
    .execute();
  await db.schema
    .dropIndex("idx_login_sessions_expires_at_ts")
    .on("login_sessions")
    .execute();
  // Drop the login_sessions_state_updated_idx before adding old columns back
  await db.schema.dropIndex("login_sessions_state_updated_idx").execute();

  // ========================================
  // STEP 2: Add varchar columns back
  // ========================================

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

  // ========================================
  // STEP 3: Migrate data back to varchar (in batches)
  // ========================================

  // --- refresh_tokens ---
  let hasMoreRefreshTokens = true;
  while (hasMoreRefreshTokens) {
    const rows = await db
      .selectFrom("refresh_tokens")
      .select([
        "tenant_id",
        "id",
        "created_at_ts",
        "expires_at_ts",
        "idle_expires_at_ts",
        "last_exchanged_at_ts",
      ])
      .where("created_at", "is", null)
      .limit(BATCH_SIZE)
      .execute();

    if (rows.length === 0) {
      hasMoreRefreshTokens = false;
      break;
    }

    for (const row of rows) {
      await db
        .updateTable("refresh_tokens")
        .set({
          created_at: timestampToIso(row.created_at_ts),
          expires_at: timestampToIso(row.expires_at_ts),
          idle_expires_at: timestampToIso(row.idle_expires_at_ts),
          last_exchanged_at: timestampToIso(row.last_exchanged_at_ts),
        })
        .where("tenant_id", "=", row.tenant_id)
        .where("id", "=", row.id)
        .execute();
    }
  }

  // --- sessions ---
  let hasMoreSessions = true;
  while (hasMoreSessions) {
    const rows = await db
      .selectFrom("sessions")
      .select([
        "tenant_id",
        "id",
        "created_at_ts",
        "updated_at_ts",
        "expires_at_ts",
        "idle_expires_at_ts",
        "authenticated_at_ts",
        "last_interaction_at_ts",
        "used_at_ts",
        "revoked_at_ts",
      ])
      .where("created_at", "is", null)
      .limit(BATCH_SIZE)
      .execute();

    if (rows.length === 0) {
      hasMoreSessions = false;
      break;
    }

    for (const row of rows) {
      await db
        .updateTable("sessions")
        .set({
          created_at: timestampToIso(row.created_at_ts),
          updated_at: timestampToIso(row.updated_at_ts),
          expires_at: timestampToIso(row.expires_at_ts),
          idle_expires_at: timestampToIso(row.idle_expires_at_ts),
          authenticated_at: timestampToIso(row.authenticated_at_ts),
          last_interaction_at: timestampToIso(row.last_interaction_at_ts),
          used_at: timestampToIso(row.used_at_ts),
          revoked_at: timestampToIso(row.revoked_at_ts),
        })
        .where("tenant_id", "=", row.tenant_id)
        .where("id", "=", row.id)
        .execute();
    }
  }

  // --- login_sessions ---
  let hasMoreLoginSessions = true;
  while (hasMoreLoginSessions) {
    const rows = await db
      .selectFrom("login_sessions")
      .select([
        "tenant_id",
        "id",
        "created_at_ts",
        "updated_at_ts",
        "expires_at_ts",
      ])
      .where("created_at", "is", null)
      .limit(BATCH_SIZE)
      .execute();

    if (rows.length === 0) {
      hasMoreLoginSessions = false;
      break;
    }

    for (const row of rows) {
      await db
        .updateTable("login_sessions")
        .set({
          created_at: timestampToIso(row.created_at_ts),
          updated_at: timestampToIso(row.updated_at_ts),
          expires_at: timestampToIso(row.expires_at_ts),
        })
        .where("tenant_id", "=", row.tenant_id)
        .where("id", "=", row.id)
        .execute();
    }
  }

  // ========================================
  // STEP 4: Restore NOT NULL constraints
  // ========================================

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .alterColumn("created_at", (col) => col.setNotNull())
    .execute();

  // --- sessions ---
  await db.schema
    .alterTable("sessions")
    .alterColumn("created_at", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("sessions")
    .alterColumn("updated_at", (col) => col.setNotNull())
    .execute();

  // --- login_sessions ---
  await db.schema
    .alterTable("login_sessions")
    .alterColumn("created_at", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .alterColumn("updated_at", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .alterColumn("expires_at", (col) => col.setNotNull())
    .execute();

  // Recreate the login_sessions_state_updated_idx after restoring columns
  await db.schema
    .createIndex("login_sessions_state_updated_idx")
    .on("login_sessions")
    .columns(["state", "updated_at"])
    .execute();
}
