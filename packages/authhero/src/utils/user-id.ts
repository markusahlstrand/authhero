import { customAlphabet } from "nanoid";

const ID_LENGTH = 24;

export function userIdGenerate() {
  const alphabet = "0123456789abcdef";

  const generateHexId = customAlphabet(alphabet, ID_LENGTH);

  const hexId = generateHexId();
  return hexId;
}

/**
 * The bare id inside an Auth0-style `provider|id` identifier — everything after
 * the *first* pipe, which is how Auth0 reports `identities[].user_id`.
 *
 * Splits on the first pipe only: enterprise identifiers embed pipes of their
 * own (`samlp|okta-connection|jane` is provider `samlp` plus bare id
 * `okta-connection|jane`), and returning just `okta-connection` would report an
 * id that resolves to no user.
 */
export function userIdParse(userId: string) {
  const separator = userId.indexOf("|");
  if (separator === -1) {
    console.error("Invalid user_id format");
    return userId;
  }

  return userId.slice(separator + 1);
}

/**
 * Drop a leading `provider|` from a user_id, leaving anything else untouched.
 *
 * Callers that accept both shapes of the same identifier (Auth0's account-link
 * body takes the bare id; some clients send the whole thing) need to normalize
 * without guessing: unlike {@link userIdParse} this only removes the one prefix
 * it is told about, so a bare id that happens to contain a pipe survives.
 */
export function stripProviderPrefix(userId: string, provider: string) {
  return userId.startsWith(`${provider}|`)
    ? userId.slice(provider.length + 1)
    : userId;
}
