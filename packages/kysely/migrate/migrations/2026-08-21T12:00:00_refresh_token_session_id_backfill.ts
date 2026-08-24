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
 *
 * SIZE-AWARE. This runs row-at-a-time, which is portable across MySQL and the
 * SQLite used by tests but costs one query per row. On Cloudflare Workers —
 * where migrateToLatest runs in production — every query is a subrequest
 * against a 1,000-per-request cap, so a large backfill cannot finish inside a
 * single invocation no matter how it is batched. Above THRESHOLD rows this
 * therefore declines the work and tells the operator where the bulk path is,
 * rather than retrying a doomed scan on every deploy.
 */

const BATCH_SIZE = 500;
const CONCURRENCY = 20;

/**
 * Highest in-scope row count this will attempt in-process.
 *
 * Deliberately below the Workers 1,000-subrequest cap: THRESHOLD updates plus
 * the count and page queries has to fit inside one invocation with room to
 * spare. Small self-hosted deployments land here and backfill automatically;
 * anything larger is an operator task.
 */
const THRESHOLD = 500;

const BULK_PATH =
  "packages/kysely/migrate/data-migrations/refresh-token-session-id-backfill.sql";

export async function up(db: Kysely<Database>): Promise<void> {
  try {
    // Same predicate as the page query below, so the estimate and the work
    // agree. Cheap relative to the backfill itself, and it runs once.
    const scope = await db
      .selectFrom("refresh_tokens")
      .innerJoin(
        "login_sessions",
        "login_sessions.id",
        "refresh_tokens.login_id",
      )
      .whereRef("login_sessions.tenant_id", "=", "refresh_tokens.tenant_id")
      .where("refresh_tokens.session_id", "is", null)
      .where("login_sessions.session_id", "is not", null)
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    const inScope = Number(scope?.count ?? 0);

    if (inScope > THRESHOLD) {
      // Not a swallowed error — a deliberate, logged handoff. Throwing here
      // instead would leave the migration pending and retry this same scan on
      // every subsequent deploy without ever finishing it, which is strictly
      // worse: it blocks the rest of the chain and still backfills nothing.
      //
      // Skipping is safe to defer because nothing breaks while the parent row
      // survives: the refresh grant falls back to reading `login_sessions`
      // whenever `session_id` is null (see the `hasDenormalisedFacts` branch
      // in authentication-flows/refresh-token.ts). What it is NOT safe to
      // defer past is enabling `login_sessions` retention — once parents are
      // pruned the facts are unrecoverable.
      migrationWarn(
        `refresh_tokens backfill: ${inScope} rows in scope, above the ` +
          `in-process limit of ${THRESHOLD}. SKIPPING — run the bulk path ` +
          `instead: ${BULK_PATH}. This must be completed before login_sessions ` +
          `retention is enabled, or the auth-event facts are lost for good.`,
      );
      return;
    }

    if (inScope === 0) {
      migrationLog("refresh_tokens backfill: nothing to do");
      return;
    }

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
                // lost, and the grant treats it as absent. Parsing in JS
                // rather than SQL is what keeps one malformed row from
                // aborting the batch — the SQL paths need an explicit
                // JSON_VALID / json_valid guard to match this behaviour.
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
    // Rethrow rather than swallow. An actual failure mid-backfill should keep
    // the migration pending so a retry picks up where it stopped; the writes
    // are idempotent (`session_id IS NULL` selects only unprocessed rows).
    // This is distinct from the THRESHOLD path above, which is a deliberate
    // decision rather than a failure and therefore returns cleanly.
    migrationWarn("refresh_tokens backfill failed:", error);
    throw error;
  }
}

export async function down(): Promise<void> {
  // Data-only migration. The column drop lives in the schema migration that
  // added them, so there is nothing to reverse here.
}
