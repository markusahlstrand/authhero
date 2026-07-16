import { CodesAdapter } from "@authhero/adapter-interfaces";

export interface CodesCleanupParams {
  /**
   * Grace period, in days, to keep codes past their expiry. Defaults to 1.
   *
   * Codes are dead the moment they expire, so this is not a retention policy
   * so much as a safety margin against clock skew — and it keeps recently
   * expired codes around briefly for debugging a failed flow.
   */
  retentionDays?: number;
}

/**
 * Delete codes that expired more than the retention window ago.
 * Intended for use in a scheduled handler / cron job.
 *
 * Codes are short-lived by design but nothing else prunes them, so without a
 * scheduled call to this the table grows without bound. See the Data Retention
 * deployment guide for the full set of tables that need sweeping.
 *
 * @example
 * ```ts
 * // Cloudflare Workers scheduled handler
 * async scheduled(_event, env) {
 *   await cleanupCodes(dataAdapter.codes, { retentionDays: 1 });
 * }
 * ```
 */
export async function cleanupCodes(
  codes: CodesAdapter,
  params: CodesCleanupParams = {},
): Promise<number> {
  const retentionDays = params.retentionDays ?? 1;
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return codes.cleanup(cutoff);
}
