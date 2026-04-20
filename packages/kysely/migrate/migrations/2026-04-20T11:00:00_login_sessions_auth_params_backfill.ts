// @ts-nocheck - Migration touches columns not modeled in the Database type
import { Kysely } from "kysely";
import { Database } from "../../src/db";
import { migrationLog, migrationWarn } from "../log";

/**
 * Backfill `login_sessions.auth_params` for rows written before the dual-write
 * release (2026-04-20T10:00:00) landed. Those rows hold the canonical
 * authParams values only in the hoisted `authParams_*` columns. Here we read
 * each such row, reconstruct the authParams object from the hoisted columns,
 * JSON-serialize it, and write it into `auth_params`.
 *
 * After this migration runs, every row has `auth_params` populated, so the
 * adapter can stop reading/writing the hoisted columns entirely (which the
 * same release does). A later release will drop the redundant columns.
 *
 * Field list mirrors authParamsSchema in
 * packages/adapter-interfaces/src/types/AuthParams.ts.
 */

const AUTH_PARAMS_FIELDS = [
  "client_id",
  "act_as",
  "response_type",
  "response_mode",
  "redirect_uri",
  "audience",
  "organization",
  "state",
  "nonce",
  "scope",
  "prompt",
  "code_challenge_method",
  "code_challenge",
  "username",
  "ui_locales",
  "max_age",
  "acr_values",
  "vendor_id",
] as const;

const BATCH_SIZE = 500;
const CONCURRENCY = 20;

export async function up(db: Kysely<Database>): Promise<void> {
  try {
    let totalUpdated = 0;

    while (true) {
      const rows = await db
        .selectFrom("login_sessions")
        .where("auth_params", "is", null)
        .selectAll()
        .limit(BATCH_SIZE)
        .execute();

      if (rows.length === 0) break;

      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (row) => {
            const authParams: Record<string, unknown> = {};
            for (const field of AUTH_PARAMS_FIELDS) {
              const value = row[`authParams_${field}`];
              if (value !== null && value !== undefined) {
                authParams[field] = value;
              }
            }

            await db
              .updateTable("login_sessions")
              .set({ auth_params: JSON.stringify(authParams) })
              .where("tenant_id", "=", row.tenant_id)
              .where("id", "=", row.id)
              .execute();
          }),
        );
      }

      totalUpdated += rows.length;
      migrationLog(
        `  Backfilled auth_params for ${totalUpdated} login_sessions row(s)...`,
      );

      if (rows.length < BATCH_SIZE) break;
    }

    if (totalUpdated === 0) {
      migrationLog(
        "  No login_sessions rows to backfill (auth_params all set)",
      );
    } else {
      migrationLog(
        `  Backfilled auth_params for ${totalUpdated} login_sessions row(s) total`,
      );
    }
  } catch (error) {
    migrationWarn(
      `  Warning: Could not backfill auth_params: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // No-op. The hoisted columns still hold the original values, and the
  // auth_params column is dropped by the down() of the migration that added
  // it (2026-04-20T10:00:00).
}
