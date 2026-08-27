// Stricter than the legacy `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`: rejects leading,
// trailing, and consecutive dots in both local-part and domain, and requires
// a 2+ character alphabetic TLD. Catches common typos like `gmail..com`,
// `.user@x.com`, and `user@.gmail.com` that the senders downstream reject.
export const EMAIL_REGEX =
  /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/**
 * Canonical form of an email identifier: surrounding whitespace stripped, then
 * lowercased.
 *
 * Both halves matter. Emails are case-insensitive identifiers, so a mixed-case
 * stored address is unreachable from a lowercasing lookup. Whitespace is worse:
 * `"user@example.com "` is stored verbatim, passes every uniqueness check
 * against its trimmed twin, and produces a second account for the same person
 * on the same connection (issue #1279). Every read and write path must agree on
 * this single definition or the two halves diverge again.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Return `payload` with `email` normalized via {@link normalizeEmail}, or
 * unchanged when there is nothing to normalize.
 *
 * This is the write-path chokepoint: every lookup (identifier-first login,
 * `getPrimaryUserByEmail`, email-based auto-linking) normalizes its input, so
 * an un-normalized stored email is unreachable and spawns duplicate accounts.
 * The zod request-schema transform only covers validated bodies — emails
 * sourced upstream (SCIM provisioning, Auth0 lazy migration, IdP profiles) and
 * emails assigned by lifecycle hooks never pass through it.
 */
export function withNormalizedEmail<T extends { email?: string }>(
  payload: T,
): T {
  if (!payload.email) {
    return payload;
  }
  const normalized = normalizeEmail(payload.email);
  return normalized === payload.email
    ? payload
    : { ...payload, email: normalized };
}
