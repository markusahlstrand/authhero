import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { userIdFilter } from "../utils/user-filter";

/**
 * Soft-revoke every active refresh token belonging to a user.
 *
 * Unlike the single-token admin delete (which also hard-removes the row),
 * this keeps the rows around with `revoked_at` set so the admin UI and the
 * audit trail can still show what was invalidated and when.
 *
 * Rows are gathered across all pages before any mutation: revoking in place
 * doesn't change the row set, but reading first keeps the traversal
 * independent of adapter-side ordering guarantees.
 *
 * Returns the number of tokens revoked.
 */
export async function revokeUserRefreshTokens(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  user_id: string,
): Promise<number> {
  const revokedAt = new Date().toISOString();

  const active: string[] = [];
  let page = 0;
  const perPage = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { refresh_tokens } = await ctx.env.data.refreshTokens.list(
      tenant_id,
      {
        page,
        per_page: perPage,
        q: userIdFilter(user_id),
      },
    );
    active.push(
      ...refresh_tokens.filter((token) => !token.revoked_at).map((t) => t.id),
    );
    if (refresh_tokens.length < perPage) break;
    page++;
  }

  let revoked = 0;
  for (const id of active) {
    const updated = await ctx.env.data.refreshTokens.update(tenant_id, id, {
      revoked_at: revokedAt,
    });
    if (updated) revoked++;
  }

  return revoked;
}
