import { Context } from "hono";
import { Session } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { waitUntil } from "./wait-until";

/**
 * How stale `sessions.used_at` may get before a session touch re-stamps it.
 *
 * Session retention analytics bucket by week, so even a daily stamp would be
 * ample precision there; an hour keeps the value fresh enough to be useful as
 * "last used" in the management API without turning every refresh-token
 * exchange into a `sessions` write. Chatty clients that refresh hourly or more
 * cost one write per hour per session instead of one per exchange.
 */
export const SESSION_USED_AT_THROTTLE_MS = 60 * 60 * 1000;

/** The subset of a session needed to decide whether to re-stamp `used_at`. */
export type SessionUsage = Pick<Session, "used_at" | "created_at">;

/**
 * Whether a session that is being used right now should have `used_at`
 * re-stamped, or whether the existing value is recent enough to leave alone.
 *
 * A session with no `used_at` falls back to `created_at`: a session created
 * ten minutes ago has already been counted in the current week, so there is
 * nothing to record yet.
 */
export function shouldStampUsedAt(
  session: SessionUsage,
  now: number = Date.now(),
): boolean {
  const lastSeen = session.used_at ?? session.created_at;
  const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : NaN;
  // A missing or unparseable timestamp means we have no evidence the session
  // was stamped recently — stamp it.
  if (!Number.isFinite(lastSeenMs)) return true;
  return now - lastSeenMs >= SESSION_USED_AT_THROTTLE_MS;
}

/**
 * Record that a session was used, off the request's critical path.
 *
 * Sessions are kept alive by refresh-token exchanges, but those write only to
 * `refresh_tokens`; without this the `sessions` row keeps the `used_at` it was
 * born with and session-retention cohorts collapse to 100% in week 0 and zero
 * everywhere after (every session looks like it was last seen the week it was
 * created).
 *
 * Both the read and the write run under `waitUntil`, so a caller on a latency-
 * sensitive path (the token endpoint) pays nothing for them. Pass `session`
 * when the caller already holds the row to skip the read entirely. Failures
 * are swallowed: a missing usage stamp must never fail a grant.
 */
export function touchSessionUsedAt(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  sessionId: string,
  session?: SessionUsage,
): void {
  const now = Date.now();

  const stamp = () =>
    ctx.env.data.sessions.update(tenantId, sessionId, {
      used_at: new Date(now).toISOString(),
    });

  if (session) {
    if (!shouldStampUsedAt(session, now)) return;
    waitUntil(
      ctx,
      stamp().catch(() => {}),
    );
    return;
  }

  waitUntil(
    ctx,
    (async () => {
      const loaded = await ctx.env.data.sessions.get(tenantId, sessionId);
      // Revoked sessions are on their way out; stamping them would make a dead
      // session look active in the retention triangle.
      if (!loaded || loaded.revoked_at) return;
      if (!shouldStampUsedAt(loaded, now)) return;
      await stamp();
    })().catch(() => {}),
  );
}
