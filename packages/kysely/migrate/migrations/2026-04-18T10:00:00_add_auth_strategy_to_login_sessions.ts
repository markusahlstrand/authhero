import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Adds fields needed by the `/authorize/resume` endpoint so that terminal
 * sub-flows (social callback, UL password, OTP, etc.) can persist the
 * authentication strategy/connection metadata onto the login session and
 * let a single endpoint finalize the response on the correct domain.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("login_sessions")
    .addColumn("auth_strategy_strategy", "varchar(64)")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("auth_strategy_strategy_type", "varchar(64)")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .addColumn("authenticated_at", "varchar(35)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("auth_strategy_strategy")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("auth_strategy_strategy_type")
    .execute();
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("authenticated_at")
    .execute();
}
