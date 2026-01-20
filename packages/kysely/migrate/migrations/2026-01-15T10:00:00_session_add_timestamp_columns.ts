// @ts-nocheck - Migration uses temporary columns not in the Database type
import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Session Tables - Add Timestamp Columns (Part 1 of 2)
 *
 * This migration adds new bigint timestamp columns (_ts suffix) to the session tables:
 * - login_sessions
 * - sessions
 * - refresh_tokens
 *
 * The new columns store Unix timestamps in milliseconds for better performance.
 * After this migration, deploy the updated code that writes to both old and new columns,
 * then run the second migration to remove the old columns.
 *
 * Changes:
 * 1. Add new bigint columns with _ts suffix
 * 2. Migrate existing data from varchar to bigint
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
}

export async function down(db: Kysely<Database>): Promise<void> {
  // ========================================
  // Drop the new _ts columns
  // ========================================

  // --- refresh_tokens ---
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("created_at_ts")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("expires_at_ts")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("idle_expires_at_ts")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("last_exchanged_at_ts")
    .execute();

  // --- sessions ---
  await db.schema
    .alterTable("sessions")
    .dropColumn("created_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("updated_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("expires_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("idle_expires_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("authenticated_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("last_interaction_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("used_at_ts")
    .execute();
  await db.schema
    .alterTable("sessions")
    .dropColumn("revoked_at_ts")
    .execute();

  // --- login_sessions ---
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("created_at_ts")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("updated_at_ts")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("expires_at_ts")
    .execute();
}
