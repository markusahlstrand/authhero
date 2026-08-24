/**
 * Split an Auth0-style `provider|id` identifier into its provider (here named
 * `connection` for historical reasons) and the bare id Auth0 reports as
 * `identities[].user_id`.
 *
 * Splits on the *first* pipe only. Enterprise identifiers embed pipes of their
 * own — `samlp|okta-connection|jane` is provider `samlp` plus bare id
 * `okta-connection|jane` — and returning just `okta-connection` would report an
 * id that resolves to no user and that cannot be unlinked.
 */
export function parseUserId(user_id: string): {
  connection: string;
  id: string;
} {
  const separator = user_id.indexOf("|");
  const connection = user_id.slice(0, separator);
  const id = user_id.slice(separator + 1);

  if (separator === -1 || !connection || !id) {
    throw new Error(`Invalid user_id: ${user_id}`);
  }

  return { connection, id };
}
