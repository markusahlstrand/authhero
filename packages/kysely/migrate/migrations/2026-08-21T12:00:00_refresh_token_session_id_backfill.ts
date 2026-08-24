// @ts-nocheck - Migration touches columns not modeled in the Database type
import { Kysely } from "kysely";
import { Database } from "../../src/db";
import { migrationLog, migrationWarn } from "../log";

/**
 * Backfill the auth-event columns added by
 * 2026-08-20T12:00:00_refresh_token_session_id, for refresh tokens minted
 * before that release started populating them at write time.
 *
 * Values are read from the token's parent `login_sessions` row. Rows whose
 * parent has already been cleaned up stay null, which is correct: they are
 * indistinguishable from a token that never had a session, and Auth0
 * represents the same state with a null `session_id`.
 *
 * IMPORTANT: all four facts are written together, or none are. The refresh
 * grant uses `session_id` as the marker for "this row carries its own facts"
 * and skips the login-session read when it is set — so a backfill that set
 * `session_id` alone would make the grant stop looking up the organization
 * and connection it still needs. Only rows where the parent yields a
 * `session_id` are touched, so the marker never runs ahead of the data.
 */

const BATCH_SIZE = 500;
const CONCURRENCY = 20;

export async function up(db: Kysely<Database>): Promise<void> {
  try {
    let totalUpdated = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Join through login_sessions so a token whose parent is gone is never
      // selected — those rows are meant to stay null.
      const rows = await db
        .selectFrom("refresh_tokens")
        .innerJoin(
          "login_sessions",
          "login_sessions.id",
          "refresh_tokens.login_id",
        )
        .whereRef("login_sessions.tenant_id", "=", "refresh_tokens.tenant_id")
        .where("refresh_tokens.session_id", "is", null)
        .where("login_sessions.session_id", "is not", null)
        .select([
          "refresh_tokens.id as id",
          "refresh_tokens.tenant_id as tenant_id",
          "login_sessions.session_id as ls_session_id",
          "login_sessions.auth_connection as ls_auth_connection",
          "login_sessions.auth_strategy_strategy as ls_strategy",
          "login_sessions.auth_strategy_strategy_type as ls_strategy_type",
          "login_sessions.auth_params as ls_auth_params",
        ])
        .limit(BATCH_SIZE)
        .execute();

      if (rows.length === 0) break;

      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (row) => {
            let organization: string | null = null;
            if (row.ls_auth_params) {
              try {
                organization =
                  JSON.parse(row.ls_auth_params)?.organization ?? null;
              } catch {
                // A login session with unparseable auth_params still yields a
                // usable session_id and connection; only the organization is
                // lost, and the grant treats it as absent.
                migrationWarn(
                  `refresh_tokens backfill: unparseable auth_params on login_session for token ${row.id}`,
                );
              }
            }

            await db
              .updateTable("refresh_tokens")
              .set({
                session_id: row.ls_session_id,
                organization,
                auth_connection: row.ls_auth_connection ?? null,
                auth_strategy_strategy: row.ls_strategy ?? null,
                auth_strategy_strategy_type: row.ls_strategy_type ?? null,
              })
              .where("tenant_id", "=", row.tenant_id)
              .where("id", "=", row.id)
              .execute();
          }),
        );
      }

      totalUpdated += rows.length;
      migrationLog(
        `refresh_tokens backfill: ${totalUpdated} rows populated so far`,
      );

      // A short batch means the last page; stop rather than re-querying.
      if (rows.length < BATCH_SIZE) break;
    }

    migrationLog(`refresh_tokens backfill: done, ${totalUpdated} rows updated`);
  } catch (error) {
    // A failed backfill must not block the release: the columns are optional
    // and the grant falls back to the login session for any row left null.
    // Re-running the migration picks up where it stopped.
    migrationWarn("refresh_tokens backfill failed, continuing:", error);
  }
}

export async function down(): Promise<void> {
  // Data-only migration. The column drop lives in the schema migration that
  // added them, so there is nothing to reverse here.
}
