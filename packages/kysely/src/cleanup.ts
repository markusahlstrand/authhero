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
  deleteBatch: () => Promise<number>;
  deleted: number;
  drained: boolean;
};

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
 * The three tables are swept round-robin rather than one after another: draining
 * them in a fixed order lets a backlog in the first table consume the whole batch
 * budget, which is how login_sessions went unswept for months while
 * refresh_tokens stayed clean.
 */
export function createSessionCleanup(db: Kysely<Database>) {
  return async (params?: SessionCleanupParams): Promise<void> => {
    const { tenant_id, user_id } = params || {};
    const now = Date.now();
    const cutoffTime = now - GRACE_PERIOD_MS;

    const sweeps: Sweep[] = [
      {
        table: "refresh_tokens",
        deleted: 0,
        drained: false,
        deleteBatch: async () => {
          let query = db
            .deleteFrom("refresh_tokens")
            .where((eb) =>
              eb.or([
                eb("expires_at_ts", "<", cutoffTime),
                eb("idle_expires_at_ts", "<", cutoffTime),
              ]),
            );

          if (tenant_id) {
            query = query.where("tenant_id", "=", tenant_id);
          }
          if (user_id) {
            query = query.where("user_id", "=", user_id);
          }

          const result = await query.limit(BATCH_SIZE).execute();
          return Number(result[0]?.numDeletedRows ?? 0);
        },
      },
      {
        table: "sessions",
        deleted: 0,
        drained: false,
        deleteBatch: async () => {
          let query = db
            .deleteFrom("sessions")
            .where((eb) =>
              eb.or([
                eb("expires_at_ts", "<", cutoffTime),
                eb("idle_expires_at_ts", "<", cutoffTime),
              ]),
            );

          if (tenant_id) {
            query = query.where("tenant_id", "=", tenant_id);
          }
          if (user_id) {
            query = query.where("user_id", "=", user_id);
          }

          const result = await query.limit(BATCH_SIZE).execute();
          return Number(result[0]?.numDeletedRows ?? 0);
        },
      },
      {
        table: "login_sessions",
        deleted: 0,
        drained: false,
        deleteBatch: async () => {
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
        },
      },
    ];

    try {
      let batches = 0;
      while (batches < MAX_BATCHES && sweeps.some((sweep) => !sweep.drained)) {
        for (const sweep of sweeps) {
          if (sweep.drained || batches >= MAX_BATCHES) {
            continue;
          }

          const deletedCount = await sweep.deleteBatch();
          batches += 1;
          sweep.deleted += deletedCount;

          // A short batch means the table has nothing left past the cutoff.
          if (deletedCount < BATCH_SIZE) {
            sweep.drained = true;
          }
        }
      }

      const summary = sweeps
        .map((sweep) => `${sweep.deleted} ${sweep.table}`)
        .join(", ");
      const notDrained = sweeps
        .filter((sweep) => !sweep.drained)
        .map((sweep) => sweep.table);

      if (notDrained.length > 0) {
        // Do not log this as a success: the backlog outlived the budget, and
        // silence here is what let it grow unnoticed in the first place.
        console.warn(
          `Session cleanup: batch budget of ${MAX_BATCHES} exhausted before ${notDrained.join(", ")} drained. Deleted ${summary}`,
        );
      } else if (sweeps.some((sweep) => sweep.deleted > 0)) {
        console.log(`Session cleanup: deleted ${summary}`);
      }
    } catch (error) {
      // Log but don't throw - this is a background cleanup task
      console.error("Error during session cleanup:", error);
    }
  };
}
