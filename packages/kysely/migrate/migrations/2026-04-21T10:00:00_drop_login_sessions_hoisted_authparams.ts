// @ts-nocheck - Migration touches columns not modeled in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog } from "../log";

/**
 * Finalize the authParams blob migration by removing the 18 hoisted
 * `authParams_*` columns from login_sessions. After this runs, the JSON
 * blob `login_sessions.auth_params` is the sole storage for authParams.
 *
 * Split from the earlier 2026-04-20T12:00:00 migration so deployers can
 * ship the blob-only adapter code (which requires 12:00:00's FK drop +
 * nullable authParams_client_id) without waiting for the heavier column
 * drop. Run this migration on your own cadence once the code release has
 * stabilised.
 *
 * Prerequisites:
 *  - 2026-04-20T10:00:00_login_sessions_auth_params: added auth_params column
 *  - 2026-04-20T11:00:00_login_sessions_auth_params_backfill: guarantees every
 *    row has auth_params populated
 *  - 2026-04-20T12:00:00_relax_login_sessions_authparams: dropped the FK and
 *    relaxed NOT NULL on authParams_client_id
 *
 * On MySQL this is a straight DROP COLUMN sequence. On SQLite the previous
 * migration already rebuilt the table with authParams_client_id nullable and
 * no FK; here we rebuild again to physically remove the hoisted columns.
 */

const HOISTED_COLUMNS = [
  "authParams_client_id",
  "authParams_vendor_id",
  "authParams_username",
  "authParams_response_type",
  "authParams_response_mode",
  "authParams_audience",
  "authParams_scope",
  "authParams_state",
  "authParams_nonce",
  "authParams_code_challenge_method",
  "authParams_code_challenge",
  "authParams_redirect_uri",
  "authParams_organization",
  "authParams_prompt",
  "authParams_act_as",
  "authParams_ui_locales",
  "authParams_max_age",
  "authParams_acr_values",
];

async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    await sql`SELECT @@version_comment`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

async function safeDropColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).dropColumn(columnName).execute();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("1091") || msg.includes("no such column")) {
      migrationLog(`  ${tableName}.${columnName} already absent, skipping`);
      return;
    }
    throw error;
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
  for (const col of HOISTED_COLUMNS) {
    await safeDropColumn(db, "login_sessions", col);
  }
  migrationLog(
    `  Dropped ${HOISTED_COLUMNS.length} hoisted authParams_* columns from login_sessions`,
  );
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
      id, tenant_id, session_id, csrf_token, authorization_url,
      ip, useragent, auth0Client, state, state_data, failure_reason,
      user_id, created_at_ts, updated_at_ts, expires_at_ts,
      auth_connection, auth_strategy_strategy, auth_strategy_strategy_type,
      authenticated_at, auth_params
    ) SELECT
      id, tenant_id, session_id, csrf_token, authorization_url,
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
    "  Recreated login_sessions without hoisted authParams_* columns",
  );
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // Intentionally unsupported: restoring the hoisted columns would require
  // reversing the backfill + recreating the FK, which is not useful in
  // practice and would lose data. Roll back by restoring from backup.
}
