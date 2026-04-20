// @ts-nocheck - Migration touches columns not modeled in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog, migrationWarn } from "../log";

/**
 * 1. Add `auth_params` — a text column that will hold `JSON.stringify(authParams)`.
 *    The adapter starts dual-writing this alongside the existing hoisted
 *    `authParams_*` columns in the same release. Pre-existing rows keep
 *    `auth_params` NULL; the adapter falls back to the hoisted columns on read
 *    until a follow-up backfill migration lands.
 *
 * 2. Widen `authorization_url` from varchar(1024) to text (MySQL only; SQLite
 *    ignores varchar(n) constraints). Real authorize URLs can exceed 1KB when
 *    carrying long scopes / PAR / id_token_hint.
 *
 * Backfill of pre-existing rows + dropping the redundant hoisted columns are
 * separate follow-up migrations.
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

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  try {
    await db.schema
      .alterTable("login_sessions")
      .addColumn("auth_params", "text")
      .execute();
    migrationLog("  Added column auth_params to login_sessions");
  } catch (error) {
    migrationWarn(
      `  Warning: Could not add auth_params column: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (dbType === "mysql") {
    try {
      await db.schema
        .alterTable("login_sessions")
        .modifyColumn("authorization_url", "text")
        .execute();
      migrationLog("  Widened authorization_url to text");
    } catch (error) {
      migrationWarn(
        `  Warning: Could not widen authorization_url: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  try {
    await db.schema
      .alterTable("login_sessions")
      .dropColumn("auth_params")
      .execute();
  } catch (error) {
    migrationWarn(
      `  Warning: Could not drop auth_params column: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (dbType === "mysql") {
    try {
      await db.schema
        .alterTable("login_sessions")
        .modifyColumn("authorization_url", "varchar(1024)")
        .execute();
    } catch (error) {
      migrationWarn(
        `  Warning: Could not narrow authorization_url: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
