// @ts-nocheck - Migration uses temporary columns not in the Database type
import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Session Tables Performance Optimization
 *
 * This migration improves the performance of the three session tables:
 * - login_sessions
 * - sessions
 * - refresh_tokens
 *
 * Changes:
 * 1. Convert date columns from varchar(35) to bigint (Unix timestamps in ms)
 * 2. Add user_id indexes for efficient lazy cleanup
 * 3. Add session_id index on refresh_tokens for cleanup queries
 * 4. Add expires_at indexes for efficient expiration queries
 *
 * Note on varchar lengths:
 * - tenant_id and id column length changes require table recreation in SQLite
 *   and are handled in a separate migration for MySQL compatibility
 * - Existing nanoid IDs (21 chars) remain valid, ULIDs (26 chars) can be used
 *   once varchar lengths are updated
 */

/**
 * Convert ISO date string to Unix timestamp in milliseconds
 */
function isoToTimestamp(isoString: string | null | undefined): number | null {
  if (!isoString || isoString === "") {
    return null;
  }
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
}

/**
 * Convert Unix timestamp in milliseconds to ISO date string
 */
function timestampToIso(timestamp: number | null | undefined): string | null {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

const BATCH_SIZE = 1000;

export async function up(db: Kysely<Database>): Promise<void> {
  // ========================================
  // STEP 1: Add new bigint columns to all tables
  // ========================================

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("created_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("expires_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("idle_expires_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("last_exchanged_at_ts", "bigint")
    .execute();

  // --- sessions ---
  await db.schema
    .alterTable("sessions")
    .addColumn("created_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("updated_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("expires_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("idle_expires_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("authenticated_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("last_interaction_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("used_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("revoked_at_ts", "bigint")
    .execute();

  // --- login_sessions ---
  await db.schema
    .alterTable("login_sessions")
    .addColumn("created_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("updated_at_ts", "bigint")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("expires_at_ts", "bigint")
    .execute();

  // ========================================
  // STEP 2: Migrate data from varchar to bigint (in batches)
  // ========================================

  // --- refresh_tokens ---
  let hasMoreRefreshTokens = true;
  while (hasMoreRefreshTokens) {
    const rows = await db
      .selectFrom("refresh_tokens")
      .select([
        "tenant_id",
        "id",
        "created_at",
        "expires_at",
        "idle_expires_at",
        "last_exchanged_at",
      ])
      .where("created_at_ts", "is", null)
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
          created_at_ts: isoToTimestamp(row.created_at),
          expires_at_ts: isoToTimestamp(row.expires_at),
          idle_expires_at_ts: isoToTimestamp(row.idle_expires_at),
          last_exchanged_at_ts: isoToTimestamp(row.last_exchanged_at),
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
        "created_at",
        "updated_at",
        "expires_at",
        "idle_expires_at",
        "authenticated_at",
        "last_interaction_at",
        "used_at",
        "revoked_at",
      ])
      .where("created_at_ts", "is", null)
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
          created_at_ts: isoToTimestamp(row.created_at),
          updated_at_ts: isoToTimestamp(row.updated_at),
          expires_at_ts: isoToTimestamp(row.expires_at),
          idle_expires_at_ts: isoToTimestamp(row.idle_expires_at),
          authenticated_at_ts: isoToTimestamp(row.authenticated_at),
          last_interaction_at_ts: isoToTimestamp(row.last_interaction_at),
          used_at_ts: isoToTimestamp(row.used_at),
          revoked_at_ts: isoToTimestamp(row.revoked_at),
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
      .select(["tenant_id", "id", "created_at", "updated_at", "expires_at"])
      .where("created_at_ts", "is", null)
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
          created_at_ts: isoToTimestamp(row.created_at),
          updated_at_ts: isoToTimestamp(row.updated_at),
          expires_at_ts: isoToTimestamp(row.expires_at),
        })
        .where("tenant_id", "=", row.tenant_id)
        .where("id", "=", row.id)
        .execute();
    }
  }

  // ========================================
  // STEP 3: Drop old varchar columns
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
  // STEP 4: Rename _ts columns to original names
  // ========================================

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("created_at_ts", "created_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("expires_at_ts", "expires_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("idle_expires_at_ts", "idle_expires_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("last_exchanged_at_ts", "last_exchanged_at")
    .execute();

  // --- sessions ---
  await db.schema
    .alterTable("sessions")
    .renameColumn("created_at_ts", "created_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("updated_at_ts", "updated_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("expires_at_ts", "expires_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("idle_expires_at_ts", "idle_expires_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("authenticated_at_ts", "authenticated_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("last_interaction_at_ts", "last_interaction_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("used_at_ts", "used_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("revoked_at_ts", "revoked_at")
    .execute();

  // --- login_sessions ---
  await db.schema
    .alterTable("login_sessions")
    .renameColumn("created_at_ts", "created_at")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .renameColumn("updated_at_ts", "updated_at")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .renameColumn("expires_at_ts", "expires_at")
    .execute();

  // ========================================
  // STEP 5: Add indexes for efficient cleanup
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
    .createIndex("idx_refresh_tokens_expires_at")
    .on("refresh_tokens")
    .column("expires_at")
    .execute();

  await db.schema
    .createIndex("idx_sessions_expires_at")
    .on("sessions")
    .column("expires_at")
    .execute();

  await db.schema
    .createIndex("idx_login_sessions_expires_at")
    .on("login_sessions")
    .column("expires_at")
    .execute();

  // Recreate the state_updated index that was dropped earlier
  await db.schema
    .createIndex("login_sessions_state_updated_idx")
    .on("login_sessions")
    .columns(["state", "updated_at"])
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
    .dropIndex("idx_refresh_tokens_expires_at")
    .on("refresh_tokens")
    .execute();
  await db.schema
    .dropIndex("idx_sessions_expires_at")
    .on("sessions")
    .execute();
  await db.schema
    .dropIndex("idx_login_sessions_expires_at")
    .on("login_sessions")
    .execute();
  // Drop the login_sessions_state_updated_idx before renaming columns
  await db.schema.dropIndex("login_sessions_state_updated_idx").execute();

  // ========================================
  // STEP 2: Add varchar columns back
  // ========================================

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("created_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("expires_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("idle_expires_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("last_exchanged_at_str", "varchar(35)")
    .execute();

  // --- sessions ---
  await db.schema
    .alterTable("sessions")
    .addColumn("created_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("updated_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("expires_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("idle_expires_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("authenticated_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("last_interaction_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("used_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("revoked_at_str", "varchar(35)")
    .execute();

  // --- login_sessions ---
  await db.schema
    .alterTable("login_sessions")
    .addColumn("created_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("updated_at_str", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("expires_at_str", "varchar(35)")
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
        "created_at",
        "expires_at",
        "idle_expires_at",
        "last_exchanged_at",
      ])
      .where("created_at_str", "is", null)
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
          created_at_str: timestampToIso(row.created_at as unknown as number),
          expires_at_str: timestampToIso(row.expires_at as unknown as number),
          idle_expires_at_str: timestampToIso(
            row.idle_expires_at as unknown as number,
          ),
          last_exchanged_at_str: timestampToIso(
            row.last_exchanged_at as unknown as number,
          ),
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
        "created_at",
        "updated_at",
        "expires_at",
        "idle_expires_at",
        "authenticated_at",
        "last_interaction_at",
        "used_at",
        "revoked_at",
      ])
      .where("created_at_str", "is", null)
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
          created_at_str: timestampToIso(row.created_at as unknown as number),
          updated_at_str: timestampToIso(row.updated_at as unknown as number),
          expires_at_str: timestampToIso(row.expires_at as unknown as number),
          idle_expires_at_str: timestampToIso(
            row.idle_expires_at as unknown as number,
          ),
          authenticated_at_str: timestampToIso(
            row.authenticated_at as unknown as number,
          ),
          last_interaction_at_str: timestampToIso(
            row.last_interaction_at as unknown as number,
          ),
          used_at_str: timestampToIso(row.used_at as unknown as number),
          revoked_at_str: timestampToIso(row.revoked_at as unknown as number),
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
      .select(["tenant_id", "id", "created_at", "updated_at", "expires_at"])
      .where("created_at_str", "is", null)
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
          created_at_str: timestampToIso(row.created_at as unknown as number),
          updated_at_str: timestampToIso(row.updated_at as unknown as number),
          expires_at_str: timestampToIso(row.expires_at as unknown as number),
        })
        .where("tenant_id", "=", row.tenant_id)
        .where("id", "=", row.id)
        .execute();
    }
  }

  // ========================================
  // STEP 4: Drop bigint columns
  // ========================================

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
  // STEP 5: Rename _str columns back to original names
  // ========================================

  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("created_at_str", "created_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("expires_at_str", "expires_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("idle_expires_at_str", "idle_expires_at")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .renameColumn("last_exchanged_at_str", "last_exchanged_at")
    .execute();

  await db.schema
    .alterTable("sessions")
    .renameColumn("created_at_str", "created_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("updated_at_str", "updated_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("expires_at_str", "expires_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("idle_expires_at_str", "idle_expires_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("authenticated_at_str", "authenticated_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("last_interaction_at_str", "last_interaction_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("used_at_str", "used_at")
    .execute();
  await db.schema
    .alterTable("sessions")
    .renameColumn("revoked_at_str", "revoked_at")
    .execute();

  await db.schema
    .alterTable("login_sessions")
    .renameColumn("created_at_str", "created_at")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .renameColumn("updated_at_str", "updated_at")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .renameColumn("expires_at_str", "expires_at")
    .execute();

  // Recreate the login_sessions_state_updated_idx after renaming columns back
  await db.schema
    .createIndex("login_sessions_state_updated_idx")
    .on("login_sessions")
    .columns(["state", "updated_at"])
    .execute();
}
