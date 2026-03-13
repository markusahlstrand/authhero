// @ts-nocheck - Migration modifies columns not in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Migration: Replace session_id with login_id on refresh_tokens
 *
 * Stage 3+4 of REFRESH_TOKEN_LOGIN_ID_MIGRATION:
 * 1. Make login_id NOT NULL (backfill must be complete)
 * 2. Drop session_id column and its index
 *
 * Prerequisites:
 * - Stage 2 backfill must be complete (all refresh tokens have login_id populated)
 */

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

export async function up(db: Kysely<any>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType === "mysql") {
    // Make login_id NOT NULL
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("login_id", "varchar(26)", (col) => col.notNull())
      .execute();

    // Drop the session_id index and column
    await db.schema.dropIndex("idx_refresh_tokens_session_id").execute();
    await db.schema
      .alterTable("refresh_tokens")
      .dropColumn("session_id")
      .execute();
  } else {
    // SQLite doesn't support MODIFY COLUMN, but modern SQLite (3.35+) supports DROP COLUMN
    // Must drop the index first before dropping the column
    await db.schema.dropIndex("idx_refresh_tokens_session_id").execute();
    await db.schema
      .alterTable("refresh_tokens")
      .dropColumn("session_id")
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType === "mysql") {
    // Re-add session_id column
    await db.schema
      .alterTable("refresh_tokens")
      .addColumn("session_id", "varchar(26)")
      .execute();

    await db.schema
      .createIndex("idx_refresh_tokens_session_id")
      .on("refresh_tokens")
      .column("session_id")
      .execute();

    // Make login_id nullable again
    await db.schema
      .alterTable("refresh_tokens")
      .modifyColumn("login_id", "varchar(26)")
      .execute();
  } else {
    await db.schema
      .alterTable("refresh_tokens")
      .addColumn("session_id", "varchar(21)")
      .execute();
  }
}
