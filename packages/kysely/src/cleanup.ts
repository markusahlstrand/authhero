import { Kysely } from "kysely";
import { Database } from "./db";
import { SessionCleanupParams } from "@authhero/adapter-interfaces";

// Grace period: wait 1 week after expiration before deleting
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

const BATCH_SIZE = 1000;

// Every DELETE below is one subrequest through the PlanetScale HTTP driver,
// and Cloudflare Workers cap an invocation at 1,000 subrequests total. This
// runs lazily inside a request that has already spent part of that budget, so
// bound our own share well below the cap. Whatever does not drain in this run
// is picked up by the next one — the sweep is idempotent.
export const MAX_BATCHES = 300;

type Sweep = {
  table: string;
  // One statement, not one table: refresh_tokens and sessions each contribute
  // two sweeps, one per expiry column. Used in the log lines.
  label: string;
  deleteBatch: () => Promise<number>;
  deleted: number;
  drained: boolean;
  failed: boolean;
};

type ExpiryColumn = "expires_at_ts" | "idle_expires_at_ts";

/**
 * Create a scoped session cleanup function that can filter by tenant and/or user.
 * This is designed for lazy cleanup after login session creation.
 *
 * The refreshTokens.create and refreshTokens.update adapter methods bump the
 * parent login_sessions.expires_at_ts in the same transaction whenever a refresh
 * token's validity is extended. Likewise, silent auth bumps it when a session is
 * refreshed. This invariant means we can delete expired login_sessions
 * independently without expensive subqueries to check for active children.
 *
 * Records are deleted only after they have been expired for the grace period (1 week).
 *
 * The tables are swept round-robin rather than one after another: draining them
 * in a fixed order lets a backlog in the first table consume the whole batch
 * budget, which is how login_sessions went unswept for months while
 * refresh_tokens stayed clean. A sweep that throws — a PlanetScale statement
 * timeout, say — is marked failed and skipped, but does not abort the others;
 * one unhealthy table must not starve the rest.
 *
 * refresh_tokens and sessions expire on either of two columns, and each gets
 * its own statement rather than one `OR`: MySQL declines to index_merge across
 * OR'd predicates and falls back to a full scan, which on a production-sized
 * table exceeds PlanetScale's 20s statement timeout and deletes nothing. Split,
 * every statement is a clean single-column index range. This is the same
 * reasoning — and the same fix — as codes/cleanup.ts.
 *
 * login_sessions is swept first because login_sessions_session_fk is
 * ON DELETE CASCADE: every sessions row deleted cascade-deletes its
 * login_sessions children, so draining the child table first makes the
 * subsequent sessions batches far cheaper.
 */
export function createSessionCleanup(db: Kysely<Database>) {
  return async (params?: SessionCleanupParams): Promise<void> => {
    const { tenant_id, user_id } = params || {};
    const now = Date.now();
    const cutoffTime = now - GRACE_PERIOD_MS;

    const refreshTokenBatch = (column: ExpiryColumn) => async () => {
      let query = db
        .deleteFrom("refresh_tokens")
        .where(column, "<", cutoffTime);

      if (tenant_id) {
        query = query.where("tenant_id", "=", tenant_id);
      }
      if (user_id) {
        query = query.where("user_id", "=", user_id);
      }

      const result = await query.limit(BATCH_SIZE).execute();
      return Number(result[0]?.numDeletedRows ?? 0);
    };

    const sessionBatch = (column: ExpiryColumn) => async () => {
      let query = db.deleteFrom("sessions").where(column, "<", cutoffTime);

      if (tenant_id) {
        query = query.where("tenant_id", "=", tenant_id);
      }
      if (user_id) {
        query = query.where("user_id", "=", user_id);
      }

      const result = await query.limit(BATCH_SIZE).execute();
      return Number(result[0]?.numDeletedRows ?? 0);
    };

    const loginSessionBatch = async () => {
      let query = db
        .deleteFrom("login_sessions")
        .where("expires_at_ts", "<", cutoffTime);

      if (tenant_id) {
        query = query.where("tenant_id", "=", tenant_id);
      }
      if (user_id) {
        query = query.where("user_id", "=", user_id);
      }

      const result = await query.limit(BATCH_SIZE).execute();
      return Number(result[0]?.numDeletedRows ?? 0);
    };

    const sweeps: Sweep[] = [
      {
        table: "login_sessions",
        label: "login_sessions.expires_at_ts",
        deleteBatch: loginSessionBatch,
      },
      {
        table: "refresh_tokens",
        label: "refresh_tokens.expires_at_ts",
        deleteBatch: refreshTokenBatch("expires_at_ts"),
      },
      {
        table: "refresh_tokens",
        label: "refresh_tokens.idle_expires_at_ts",
        deleteBatch: refreshTokenBatch("idle_expires_at_ts"),
      },
      {
        table: "sessions",
        label: "sessions.expires_at_ts",
        deleteBatch: sessionBatch("expires_at_ts"),
      },
      {
        table: "sessions",
        label: "sessions.idle_expires_at_ts",
        deleteBatch: sessionBatch("idle_expires_at_ts"),
      },
    ].map((sweep) => ({ ...sweep, deleted: 0, drained: false, failed: false }));

    let batches = 0;
    while (batches < MAX_BATCHES && sweeps.some((sweep) => !sweep.drained)) {
      for (const sweep of sweeps) {
        if (sweep.drained || batches >= MAX_BATCHES) {
          continue;
        }

        batches += 1;

        try {
          const deletedCount = await sweep.deleteBatch();
          sweep.deleted += deletedCount;

          // A short batch means the table has nothing left past the cutoff.
          if (deletedCount < BATCH_SIZE) {
            sweep.drained = true;
          }
        } catch (error) {
          // Log but don't throw - this is a background cleanup task, and the
          // remaining sweeps still have work to do.
          sweep.failed = true;
          sweep.drained = true;
          console.error(
            `Error during session cleanup (${sweep.label}):`,
            error,
          );
        }
      }
    }

    const totals = new Map<string, number>();
    for (const sweep of sweeps) {
      totals.set(sweep.table, (totals.get(sweep.table) ?? 0) + sweep.deleted);
    }
    const summary = [...totals]
      .map(([table, deleted]) => `${deleted} ${table}`)
      .join(", ");

    const failed = sweeps
      .filter((sweep) => sweep.failed)
      .map((sweep) => sweep.label);
    const notDrained = sweeps
      .filter((sweep) => !sweep.drained)
      .map((sweep) => sweep.label);

    if (failed.length > 0) {
      console.warn(
        `Session cleanup: ${failed.join(", ")} failed. Deleted ${summary}`,
      );
    } else if (notDrained.length > 0) {
      // Do not log this as a success: the backlog outlived the budget, and
      // silence here is what let it grow unnoticed in the first place.
      console.warn(
        `Session cleanup: batch budget of ${MAX_BATCHES} exhausted before ${notDrained.join(", ")} drained. Deleted ${summary}`,
      );
    } else if (sweeps.some((sweep) => sweep.deleted > 0)) {
      console.log(`Session cleanup: deleted ${summary}`);
    }
  };
}
