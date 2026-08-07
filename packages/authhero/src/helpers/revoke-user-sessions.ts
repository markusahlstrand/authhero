import { Context } from "hono";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { logMessage } from "./logging";

/**
 * Revoke all of a user's sessions and the refresh tokens issued under them.
 * Used when a user is blocked — Auth0 terminates a user's sessions on block —
 * and reused by SCIM deactivation (Phase 2, #1191).
 *
 * Returns the number of refresh tokens revoked. Sessions are gathered up front
 * (across pages) before any mutation, so revoking in place cannot interfere
 * with pagination.
 */
export async function revokeUserSessions(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  user_id: string,
): Promise<number> {
  const revokedAt = new Date().toISOString();

  const allSessions: { id: string; login_session_id?: string; revoked_at?: string }[] =
    [];
  let page = 0;
  const perPage = 100;
  // Read every page before mutating anything.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { sessions } = await ctx.env.data.sessions.list(tenant_id, {
      page,
      per_page: perPage,
      q: `user_id:${user_id}`,
    });
    allSessions.push(...sessions);
    if (sessions.length < perPage) break;
    page++;
  }

  let revokedRefreshTokens = 0;
  for (const session of allSessions) {
    if (session.revoked_at) continue;
    if (session.login_session_id) {
      revokedRefreshTokens += await ctx.env.data.refreshTokens.revokeByLoginSession(
        tenant_id,
        session.login_session_id,
        revokedAt,
      );
    }
    await ctx.env.data.sessions.update(tenant_id, session.id, {
      revoked_at: revokedAt,
    });
  }

  if (revokedRefreshTokens > 0 || allSessions.length > 0) {
    logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_REVOCATION,
      description: `Revoked ${allSessions.length} session(s) and ${revokedRefreshTokens} refresh token(s) on user block`,
      userId: user_id,
    });
  }

  return revokedRefreshTokens;
}
