import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Replace login_completed with state machine columns
 *
 * This migration:
 * 1. Adds state machine columns (state, state_data, failure_reason)
 * 2. Backfills state from login_completed
 * 3. Drops the login_completed column
 */

/**
 * Up migration: Replace login_completed with state columns
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Add new columns (SQLite requires separate ALTER TABLE statements for each column)
  await db.schema
    .alterTable("login_sessions")
    .addColumn("state", "varchar(50)", (col) => col.defaultTo("pending"))
    .execute();

  await db.schema
    .alterTable("login_sessions")
    .addColumn("state_data", "text")
    .execute();

  await db.schema
    .alterTable("login_sessions")
    .addColumn("failure_reason", "text")
    .execute();

  await db.schema
    .alterTable("login_sessions")
    .addColumn("user_id", "varchar(255)")
    .execute();

  // Note: SQLite doesn't support adding foreign keys via ALTER TABLE.
  // Ideally this would be: FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, user_id)
  // For PostgreSQL deployments, consider adding this constraint manually.

  // Add composite index for user lookups (also serves as pseudo-FK documentation)
  await db.schema
    .createIndex("login_sessions_tenant_user_idx")
    .on("login_sessions")
    .columns(["tenant_id", "user_id"])
    .execute();

  // Backfill state based on existing login_completed values
  await db
    .updateTable("login_sessions")
    .set({
      state: sql`CASE
        WHEN login_completed = 1 THEN 'completed'
        WHEN expires_at < CURRENT_TIMESTAMP THEN 'expired'
        ELSE 'pending'
      END`,
    })
    .execute();

  // Drop the old login_completed column
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("login_completed")
    .execute();

  // Add index on state for efficient queries
  await db.schema
    .createIndex("login_sessions_state_idx")
    .on("login_sessions")
    .column("state")
    .execute();

  // Add composite index for finding stuck/in-progress sessions
  await db.schema
    .createIndex("login_sessions_state_updated_idx")
    .on("login_sessions")
    .columns(["state", "updated_at"])
    .execute();
}

/**
 * Down migration: Restore login_completed from state
 */
export async function down(db: Kysely<Database>): Promise<void> {
  // Re-add login_completed column
  await db.schema
    .alterTable("login_sessions")
    .addColumn("login_completed", "integer", (col) => col.defaultTo(0))
    .execute();

  // Backfill login_completed from state
  await db
    .updateTable("login_sessions")
    .set({
      login_completed: sql`CASE WHEN state = 'completed' THEN 1 ELSE 0 END`,
    })
    .execute();

  // Drop indexes
  await db.schema.dropIndex("login_sessions_state_updated_idx").execute();

  await db.schema.dropIndex("login_sessions_state_idx").execute();

  await db.schema.dropIndex("login_sessions_tenant_user_idx").execute();

  // Drop state columns
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("state")
    .dropColumn("state_data")
    .dropColumn("failure_reason")
    .dropColumn("user_id")
    .execute();
}
