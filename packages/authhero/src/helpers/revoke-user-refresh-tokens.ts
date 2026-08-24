import { Context } from "hono";
import { Bindings, Variables } from "../types";

/**
 * Soft-revoke every active refresh token belonging to a user.
 *
 * Unlike the single-token admin delete (which also hard-removes the row), this
 * keeps the rows around with `revoked_at` set so the admin UI and the audit
 * trail can still show what was invalidated and when.
 *
 * Delegates to the adapter so the match is a pair of exact predicates rather
 * than a `q` filter: the Lucene grammar splits on ` OR ` before tokenizing, so
 * a user id containing ` OR user_id:<other> OR ` would widen a `q`-based
 * revoke to another user's tokens. The adapter also skips already-revoked
 * rows, so a concurrent revocation cannot overwrite an existing timestamp.
 *
 * Returns the number of tokens revoked.
 */
export async function revokeUserRefreshTokens(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  user_id: string,
): Promise<number> {
  return ctx.env.data.refreshTokens.revokeByUser(
    tenant_id,
    user_id,
    new Date().toISOString(),
  );
}
