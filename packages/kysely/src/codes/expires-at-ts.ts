/**
 * Convert a code's ISO-8601 `expires_at` into the numeric `expires_at_ts` twin.
 *
 * `Code.expires_at` is only typed as `z.string()`, so an unparseable value is
 * representable. `Date.getTime()` would return NaN for it, which fails against
 * the bigint column. Treat it as already expired (0) instead: such a code is
 * unusable anyway, and 0 keeps it sweepable rather than stranding it in the
 * table forever. The migration's backfill applies the same rule.
 */
export function toExpiresAtTs(expiresAt: string): number {
  const parsed = new Date(expiresAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
