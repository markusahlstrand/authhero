// @ts-nocheck - Migration touches columns not modeled in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog, migrationWarn } from "../log";

/**
 * Relax the login_sessions schema so adapters that stopped writing the hoisted
 * authParams_* columns (authhero >= 0.x with the JSON-blob-only write path)
 * can insert rows on the pre-drop schema. This is the first half of the
 * split from the previous combined drop migration; the actual column drop
 * is deferred to 2026-04-21T10:00:00_drop_login_sessions_hoisted_authparams
 * so the code release can go out ahead of the heavier schema change.
 *
 * Changes:
 *  - Drop `login_sessions_client_fk`, the FK that backed
 *    `authParams_client_id` to `clients(tenant_id, client_id)`. The client_id
 *    now lives only inside the JSON blob, which cannot be foreign-keyed.
 *  - Drop the `NOT NULL` constraint on `authParams_client_id` so inserts from
 *    the new adapter (which doesn't populate the hoisted column) succeed.
 *
 * All other hoisted `authParams_*` columns were already nullable and are left
 * in place here; the follow-up migration drops them once the code release has
 * stabilised.
 *
 * On MySQL this is two cheap ALTER TABLE statements. On SQLite both changes
 * require a table rebuild, which we do in one pass — but we preserve the
 * hoisted columns so the two migrations stay semantically distinct.
 */

async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    // MySQL-specific probe: @@version_comment exists on MySQL/MariaDB but
    // not on PostgreSQL or SQLite, so we avoid mis-classifying Postgres
    // (which also supports SELECT VERSION()) as MySQL.
    await sql`SELECT @@version_comment`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);
  if (dbType === "mysql") {
    await upMySQL(db);
  } else {
    await upSQLite(db);
  }
}

async function upMySQL(db: Kysely<Database>): Promise<void> {
  try {
    await sql`ALTER TABLE login_sessions DROP FOREIGN KEY login_sessions_client_fk`.execute(
      db,
    );
    migrationLog("  Dropped FK login_sessions_client_fk");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // 1091 = errno for "unknown constraint"; some MySQL variants surface it
    // as the text below.
    if (msg.includes("1091") || msg.includes("doesn't exist")) {
      migrationLog("  FK login_sessions_client_fk already absent, skipping");
    } else {
      migrationWarn(
        `  Warning: could not drop login_sessions_client_fk: ${msg}`,
      );
    }
  }

  try {
    await sql`ALTER TABLE login_sessions MODIFY authParams_client_id varchar(191) NULL`.execute(
      db,
    );
    migrationLog("  Relaxed NOT NULL on login_sessions.authParams_client_id");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // Don't swallow: a silent warn here would let the migration record as
    // applied while the NOT NULL change never actually happened, leaving
    // inserts from the new adapter broken.
    migrationWarn(`  Failed to relax authParams_client_id NOT NULL: ${msg}`);
    throw error;
  }
}

async function upSQLite(db: Kysely<Database>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("login_sessions_new")
      .addColumn("id", "varchar(26)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(255)", (col) =>
        col.references("tenants.id").onDelete("cascade").notNull(),
      )
      .addColumn("session_id", "varchar(26)")
      .addColumn("csrf_token", "varchar(26)", (col) => col.notNull())
      // All hoisted authParams_* columns kept, but authParams_client_id is
      // now nullable and no longer backed by an FK.
      .addColumn("authParams_client_id", "varchar(191)")
      .addColumn("authParams_vendor_id", "varchar(255)")
      .addColumn("authParams_username", "varchar(255)")
      .addColumn("authParams_response_type", "varchar(255)")
      .addColumn("authParams_response_mode", "varchar(255)")
      .addColumn("authParams_audience", "varchar(255)")
      .addColumn("authParams_scope", "text")
      .addColumn("authParams_state", "text")
      .addColumn("authParams_nonce", "varchar(255)")
      .addColumn("authParams_code_challenge_method", "varchar(255)")
      .addColumn("authParams_code_challenge", "varchar(255)")
      .addColumn("authParams_redirect_uri", "text")
      .addColumn("authParams_organization", "varchar(255)")
      .addColumn("authParams_prompt", "varchar(32)")
      .addColumn("authParams_act_as", "varchar(256)")
      .addColumn("authParams_ui_locales", "varchar(32)")
      .addColumn("authParams_max_age", "integer")
      .addColumn("authParams_acr_values", "varchar(255)")
      .addColumn("authorization_url", "text")
      .addColumn("ip", "varchar(39)")
      .addColumn("useragent", "text")
      .addColumn("auth0Client", "varchar(255)")
      .addColumn("state", "varchar(50)", (col) => col.defaultTo("pending"))
      .addColumn("state_data", "text")
      .addColumn("failure_reason", "text")
      .addColumn("user_id", "varchar(255)")
      .addColumn("created_at_ts", "bigint")
      .addColumn("updated_at_ts", "bigint")
      .addColumn("expires_at_ts", "bigint")
      .addColumn("auth_connection", "varchar(255)")
      .addColumn("auth_strategy_strategy", "varchar(64)")
      .addColumn("auth_strategy_strategy_type", "varchar(64)")
      .addColumn("authenticated_at", "varchar(35)")
      .addColumn("auth_params", "text")
      .addPrimaryKeyConstraint("login_sessions_pk", ["tenant_id", "id"])
      .addForeignKeyConstraint(
        "login_sessions_session_fk",
        ["tenant_id", "session_id"],
        "sessions",
        ["tenant_id", "id"],
        (cb) => cb.onDelete("cascade"),
      )
      .execute();

    await sql`INSERT INTO login_sessions_new (
      id, tenant_id, session_id, csrf_token,
      authParams_client_id, authParams_vendor_id, authParams_username,
      authParams_response_type, authParams_response_mode, authParams_audience,
      authParams_scope, authParams_state, authParams_nonce,
      authParams_code_challenge_method, authParams_code_challenge,
      authParams_redirect_uri, authParams_organization, authParams_prompt,
      authParams_act_as, authParams_ui_locales, authParams_max_age,
      authParams_acr_values, authorization_url,
      ip, useragent, auth0Client, state, state_data, failure_reason,
      user_id, created_at_ts, updated_at_ts, expires_at_ts,
      auth_connection, auth_strategy_strategy, auth_strategy_strategy_type,
      authenticated_at, auth_params
    ) SELECT
      id, tenant_id, session_id, csrf_token,
      authParams_client_id, authParams_vendor_id, authParams_username,
      authParams_response_type, authParams_response_mode, authParams_audience,
      authParams_scope, authParams_state, authParams_nonce,
      authParams_code_challenge_method, authParams_code_challenge,
      authParams_redirect_uri, authParams_organization, authParams_prompt,
      authParams_act_as, authParams_ui_locales, authParams_max_age,
      authParams_acr_values, authorization_url,
      ip, useragent, auth0Client, state, state_data, failure_reason,
      user_id, created_at_ts, updated_at_ts, expires_at_ts,
      auth_connection, auth_strategy_strategy, auth_strategy_strategy_type,
      authenticated_at, auth_params
    FROM login_sessions`.execute(trx);

    await sql`DROP TABLE login_sessions`.execute(trx);
    await sql`ALTER TABLE login_sessions_new RENAME TO login_sessions`.execute(
      trx,
    );

    await trx.schema
      .createIndex("login_sessions_id_index")
      .on("login_sessions")
      .column("id")
      .execute();

    await trx.schema
      .createIndex("idx_login_sessions_session_id")
      .on("login_sessions")
      .column("session_id")
      .execute();

    await trx.schema
      .createIndex("login_sessions_tenant_user_idx")
      .on("login_sessions")
      .columns(["tenant_id", "user_id"])
      .execute();

    await trx.schema
      .createIndex("login_sessions_state_idx")
      .on("login_sessions")
      .column("state")
      .execute();

    await trx.schema
      .createIndex("idx_login_sessions_expires_at_ts")
      .on("login_sessions")
      .column("expires_at_ts")
      .execute();
  });
  migrationLog(
    "  Rebuilt login_sessions with FK dropped and authParams_client_id nullable",
  );
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // Intentionally unsupported: restoring the FK would fail for any row whose
  // authParams blob references a client that no longer exists, and
  // re-imposing NOT NULL on authParams_client_id would fail for any row
  // written after this migration. Roll back by restoring from backup.
}
