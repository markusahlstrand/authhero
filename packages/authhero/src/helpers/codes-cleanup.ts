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
 *
 * Prefer `runRetention`, which calls this along with every other prunable
 * table — scheduling one call means a future prunable table is covered without
 * editing your handler. Use this directly only when you want to sweep `codes`
 * on its own schedule.
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
