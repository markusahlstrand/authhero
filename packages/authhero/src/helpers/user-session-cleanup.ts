import { Context } from "hono";
import { Bindings, Variables } from "../types";

/**
 * Parameters for cleaning up expired sessions for a specific user
 */
export interface UserSessionCleanupParams {
  tenantId: string;
  userId?: string;
}

/**
 * Cleanup expired login_sessions, sessions, and refresh_tokens.
 * Can be scoped to a specific user.
 * This is designed to be called with waitUntil after creating a new login session.
 *
 * Usage:
 * ```typescript
 * import { waitUntil } from "./wait-until";
 * import { cleanupUserSessions } from "./user-session-cleanup";
 *
 * // After creating a login session
 * waitUntil(ctx, cleanupUserSessions(ctx, { tenantId, userId }));
 * ```
 */
export async function cleanupUserSessions(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: UserSessionCleanupParams,
): Promise<void> {
  const { tenantId, userId } = params;
  const { data } = ctx.env;

  // Use the adapter's sessionCleanup if available
  if (data.sessionCleanup) {
    await data.sessionCleanup({
      tenant_id: tenantId,
      user_id: userId,
    });
  }
}
