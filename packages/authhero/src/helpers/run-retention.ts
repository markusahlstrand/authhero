import { DataAdapters } from "@authhero/adapter-interfaces";
import { cleanupCodes } from "./codes-cleanup";
import { cleanupOutbox } from "./outbox-cleanup";

export interface RunRetentionConfig {
  /** Same `DataAdapters` passed to `init()`. */
  dataAdapter: DataAdapters;

  /** Grace period past expiry for `codes`. Default 1. */
  codesRetentionDays?: number;

  /** Days to keep processed/dead-lettered outbox events. Default 7. */
  outboxRetentionDays?: number;

  /**
   * Scope the session sweep to a single tenant. Codes and outbox events are
   * always swept globally — an expired row is dead regardless of who owns it.
   */
  tenantId?: string;
}

export type RetentionSweepStatus = "swept" | "skipped" | "failed";

interface RetentionSweepBase {
  /** Table(s) this sweep covers, for logging. */
  table: string;
}

export interface RetentionSweepSwept extends RetentionSweepBase {
  status: "swept";
  /**
   * Rows deleted. Absent when the underlying adapter reports no count —
   * `sessionCleanup` returns void, so a session sweep succeeds without one.
   */
  deleted?: number;
}

export interface RetentionSweepSkipped extends RetentionSweepBase {
  status: "skipped";
  /** Why the sweep was skipped — an adapter that does not support it. */
  reason: string;
}

export interface RetentionSweepFailed extends RetentionSweepBase {
  status: "failed";
  error: unknown;
}

/**
 * Discriminated on `status`, so a sweep cannot carry fields that contradict
 * it — no `error` on a successful sweep, no `deleted` on a failed one.
 */
export type RetentionSweep =
  | RetentionSweepSwept
  | RetentionSweepSkipped
  | RetentionSweepFailed;

export interface RunRetentionResult {
  sweeps: RetentionSweep[];
}

/**
 * Thrown when one or more sweeps failed. The other sweeps still ran — check
 * `result` for what succeeded.
 */
export class RetentionSweepError extends Error {
  readonly result: RunRetentionResult;
  readonly errors: unknown[];

  constructor(result: RunRetentionResult, errors: unknown[]) {
    const failed = result.sweeps
      .filter((sweep) => sweep.status === "failed")
      .map((sweep) => sweep.table)
      .join(", ");
    super(`Retention sweep failed for: ${failed}`);
    this.name = "RetentionSweepError";
    this.result = result;
    this.errors = errors;
  }
}

/**
 * Sweep every prunable AuthHero table in one call.
 *
 * This is the entry point for retention — a deployment that schedules this
 * daily needs nothing else, and gains coverage of future prunable tables
 * without editing its handler.
 *
 * Covers `codes`, `outbox_events`, and (where the adapter supports it)
 * `sessions` / `refresh_tokens` / `login_sessions`. It does **not** drain the
 * outbox: delivery is `runOutboxRelay`'s job, and the two are scheduled
 * independently. Running both is safe — the relay's own cleanup pass and this
 * one are idempotent.
 *
 * `logs` is deliberately excluded. Audit-retention obligations differ per
 * deployment, so AuthHero will not silently delete audit rows on your behalf;
 * prune `logs` on `date` yourself.
 *
 * Every sweep runs even if an earlier one throws, so one broken adapter method
 * cannot stop the rest of the tables being pruned. If any sweep failed, a
 * `RetentionSweepError` carrying the partial result is thrown once at the end.
 *
 * @example
 * ```ts
 * export default {
 *   async scheduled(_event, env) {
 *     const { sweeps } = await runRetention({ dataAdapter });
 *     console.log(sweeps);
 *   },
 * };
 * ```
 */
export async function runRetention(
  config: RunRetentionConfig,
): Promise<RunRetentionResult> {
  const { dataAdapter, codesRetentionDays, outboxRetentionDays, tenantId } =
    config;

  const sweeps: RetentionSweep[] = [];
  const errors: unknown[] = [];

  // Each entry returns a deleted count, or undefined when the adapter does not
  // report one. Returning `null` marks the sweep unsupported by this adapter.
  // Adding a prunable table means adding an entry here — not editing every
  // consumer's scheduled handler.
  const tasks: {
    table: string;
    run: () => Promise<number | undefined | null>;
  }[] = [
    {
      table: "codes",
      run: () =>
        cleanupCodes(dataAdapter.codes, { retentionDays: codesRetentionDays }),
    },
    {
      table: "outbox_events",
      run: async () => {
        if (!dataAdapter.outbox) {
          return null;
        }
        return cleanupOutbox(dataAdapter.outbox, {
          retentionDays: outboxRetentionDays,
        });
      },
    },
    {
      table: "sessions, refresh_tokens, login_sessions",
      run: async () => {
        if (!dataAdapter.sessionCleanup) {
          return null;
        }
        await dataAdapter.sessionCleanup(
          tenantId ? { tenant_id: tenantId } : undefined,
        );
        return undefined;
      },
    },
  ];

  for (const task of tasks) {
    try {
      const deleted = await task.run();
      if (deleted === null) {
        sweeps.push({
          table: task.table,
          status: "skipped",
          reason: "not supported by this adapter",
        });
      } else {
        sweeps.push({ table: task.table, status: "swept", deleted });
      }
    } catch (error) {
      errors.push(error);
      sweeps.push({ table: task.table, status: "failed", error });
    }
  }

  const result: RunRetentionResult = { sweeps };

  if (errors.length > 0) {
    throw new RetentionSweepError(result, errors);
  }

  return result;
}
