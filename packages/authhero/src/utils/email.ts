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
 * Return `payload` with `email` lowercased, or unchanged when there is nothing
 * to normalize.
 *
 * Emails are case-insensitive identifiers: every lookup (identifier-first
 * login, `getPrimaryUserByEmail`, email-based auto-linking) lowercases its
 * input, so a mixed-case stored email is unreachable and spawns duplicate
 * accounts. The zod request-schema transform only covers validated bodies —
 * emails sourced upstream (SCIM provisioning, Auth0 lazy migration, IdP
 * profiles) and emails assigned by lifecycle hooks never pass through it.
 */
export function withLowercasedEmail<T extends { email?: string }>(
  payload: T,
): T {
  if (!payload.email) {
    return payload;
  }
  const lowercased = payload.email.toLowerCase();
  return lowercased === payload.email
    ? payload
    : { ...payload, email: lowercased };
}
