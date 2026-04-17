import { OutboxAdapter } from "@authhero/adapter-interfaces";

export interface OutboxCleanupParams {
  /** Days to keep processed (and dead-lettered) events. Defaults to 7. */
  retentionDays?: number;
}

/**
 * Delete processed outbox events older than the retention window.
 * Intended for use in a scheduled handler / cron job.
 */
export async function cleanupOutbox(
  outbox: OutboxAdapter,
  params: OutboxCleanupParams = {},
): Promise<number> {
  const retentionDays = params.retentionDays ?? 7;
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return outbox.cleanup(cutoff);
}
