import { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * The parts of a session this cascade needs: its own id, which refresh tokens
 * point at through `session_id`, and the login session it originated from,
 * which is the only link rows minted before that column existed carry.
 */
export interface RevocableSession {
  id: string;
  login_session_id?: string;
}

/**
 * Revoke every refresh token issued under a session.
 *
 * Call this only where a session is *deliberately* ended — an admin revoking
 * or deleting it, or a user being blocked. Natural expiry and cleanup must not
 * cascade: a refresh token is designed to outlive its session, and killing
 * tokens on an SSO timeout would log out every long-lived native client on
 * each timeout. Revocation couples; lifetime does not.
 *
 * Two sweeps, run in sequence:
 *
 * 1. `session_id` — the ownership edge, and the one that is actually complete.
 * 2. `login_id` — legacy fallback for rows minted before `session_id` existed.
 *    `sessions.login_session_id` records only the session's *originating*
 *    authorization transaction and is never repointed on SSO reuse, so on its
 *    own it misses every token minted during a later re-authorization. It is
 *    retained until pre-Stage-2 rows have aged out (#1259) and then dropped.
 *
 * Sequential rather than parallel because a row can match both predicates, and
 * both adapters guard on `revoked_at IS NULL` — so the second sweep skips what
 * the first already revoked instead of double-counting it.
 */
export async function revokeSessionRefreshTokens(
  data: DataAdapters,
  tenant_id: string,
  session: RevocableSession,
  revoked_at: string,
): Promise<number> {
  let revoked = await data.refreshTokens.revokeBySession(
    tenant_id,
    session.id,
    revoked_at,
  );

  if (session.login_session_id) {
    revoked += await data.refreshTokens.revokeByLoginSession(
      tenant_id,
      session.login_session_id,
      revoked_at,
    );
  }

  return revoked;
}
