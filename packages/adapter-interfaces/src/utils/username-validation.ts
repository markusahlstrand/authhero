/**
 * Auth0-parity validation for database-connection usernames.
 *
 * Auth0 accepts alphanumerics (no accent marks, lowercased on write) plus a
 * fixed punctuation set, and rejects anything else with a 400 rather than
 * sanitizing the input:
 * https://auth0.com/docs/authenticate/database-connections/require-username
 *
 * ONE DELIBERATE DIVERGENCE: Auth0 also permits "@", we do not. The presence
 * of an "@" is how `getConnectionFromIdentifier` and `getUserByProvider`
 * distinguish an email identifier from a plain username, so allowing it here
 * would misroute logins. Both carry an INVARIANT comment pointing at this
 * rule; keep them in sync.
 */
const USERNAME_ALLOWED_PATTERN = /^[A-Za-z0-9_+\-.!#$'^`~]+$/;

/** Mirrors Auth0's own wording, minus the "@" it allows and we don't. */
export const USERNAME_INVALID_CHARACTERS_MESSAGE =
  "Username can only contain alphanumeric characters and the following characters: '_', '+', '-', '.', '!', '#', '$', \"'\", '^', '`', '~'";

export const USERNAME_CONTAINS_AT_MESSAGE =
  'Usernames must not contain "@". Use the email field for email addresses.';

export function usernameHasOnlyAllowedCharacters(username: string): boolean {
  return USERNAME_ALLOWED_PATTERN.test(username);
}

/**
 * Auth0 lowercases usernames on write, so `MyUser` and `myuser` are the same
 * account. Applied at the write boundary only — never to values read back out
 * of the database, which may predate this rule.
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

export interface UsernameLengthBounds {
  min: number;
  max: number;
}

/**
 * Returns an Auth0-shaped error message, or `null` when the username is valid.
 * `bounds` comes from the connection's own configuration via
 * `getConnectionIdentifierConfig`; omit it to skip the length check (the
 * caller has no connection in hand).
 */
export function validateUsername(
  username: string,
  bounds?: UsernameLengthBounds,
): string | null {
  // Checked before the character set so an email address gets the message
  // that actually tells the caller what to do, rather than a generic one.
  if (username.includes("@")) {
    return USERNAME_CONTAINS_AT_MESSAGE;
  }

  if (!usernameHasOnlyAllowedCharacters(username)) {
    return USERNAME_INVALID_CHARACTERS_MESSAGE;
  }

  if (bounds) {
    // Count code points, not UTF-16 code units: every allowed character is
    // single-unit today, but the length gate must not disagree with what a
    // caller sees if the allowed set ever widens.
    const length = [...username].length;
    if (length < bounds.min) {
      return `Username must be at least ${bounds.min} characters`;
    }
    if (length > bounds.max) {
      return `Username must be at most ${bounds.max} characters`;
    }
  }

  return null;
}
