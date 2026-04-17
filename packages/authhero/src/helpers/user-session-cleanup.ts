import { Context } from "hono";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";

export interface UserSessionCleanupParams {
  tenantId?: string;
  userId?: string;
}

/**
 * Context-free session cleanup for use in scheduled handlers / cron jobs.
 * Deletes expired login_sessions, sessions, and refresh_tokens, optionally
 * scoped to a tenant and/or user.
 */
export async function cleanupSessions(
  data: DataAdapters,
  params: UserSessionCleanupParams = {},
): Promise<void> {
  if (!data.sessionCleanup) return;

  await data.sessionCleanup({
    tenant_id: params.tenantId,
    user_id: params.userId,
  });
}

/**
 * Per-request wrapper around cleanupSessions. Designed to be called with
 * waitUntil after creating a new login session.
 */
export async function cleanupUserSessions(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: UserSessionCleanupParams,
): Promise<void> {
  await cleanupSessions(ctx.env.data, params);
}
