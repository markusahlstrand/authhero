import { z } from "@hono/zod-openapi";

/**
 * Write-often per-user counters split out of the `users` row (issue #1003) so
 * the profile row isn't rewritten on every login / failed password attempt.
 * 1:1 with a user, keyed by `(tenant_id, user_id)`.
 */
export const userActivitySchema = z.object({
  user_id: z.string(),
  last_login: z.string().optional(),
  last_ip: z.string().optional(),
  login_count: z.number().default(0),
  // Lockout timestamps (ISO 8601). Lifted out of `app_metadata` in a later
  // phase — included here so the schema is complete.
  failed_logins: z.array(z.string()).optional(),
  last_password_reset: z.string().optional(),
});

export type UserActivity = z.infer<typeof userActivitySchema>;

/** Partial payload for an upsert — only the provided fields are written. */
export type UserActivityUpdate = Partial<Omit<UserActivity, "user_id">>;
