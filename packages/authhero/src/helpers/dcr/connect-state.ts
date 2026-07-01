/**
 * A `/connect/start` login session stashes its DCR consent context under
 * `state_data.connect` (see routes/auth-api/connect-start.ts). Such a session
 * is NOT a real OAuth request — it carries no `redirect_uri`/`response_type`
 * and exists only to authenticate the user for the DCR consent screen.
 *
 * Both the login-completion path (createFrontChannelAuthResponse) and the
 * social callback (connectionCallback) use this predicate to recognize a
 * connect session so they hand control back to `/u2/connect/start` instead of
 * attempting a normal front-channel OAuth response (which would dead-end on
 * the missing redirect_uri).
 */
export function isConnectLoginSession(
  stateDataJson?: string | null,
): boolean {
  if (!stateDataJson) return false;
  try {
    const parsed = JSON.parse(stateDataJson) as { connect?: unknown };
    return Boolean(parsed?.connect);
  } catch {
    return false;
  }
}
