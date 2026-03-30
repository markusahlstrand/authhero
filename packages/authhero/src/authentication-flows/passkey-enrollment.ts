/**
 * Passkey progressive enrollment — nudge logic
 *
 * Decides whether to show a passkey enrollment nudge to the user after login.
 * Mirrors Auth0's progressive enrollment behaviour:
 *   1. Connection must have progressive_enrollment_enabled + passkey enabled
 *   2. User must have zero confirmed passkey/webauthn enrollments
 *   3. User hasn't permanently opted out
 *   4. User hasn't snoozed within the last 30 days
 */

import { Context } from "hono";
import { Bindings, Variables } from "../types";

const PASSKEY_TYPES = ["passkey", "webauthn-roaming", "webauthn-platform"];
const SNOOZE_DAYS = 30;

export interface PasskeyNudgeResult {
  show: boolean;
}

export async function checkPasskeyNudgeRequired(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  userId: string,
  connectionName?: string,
): Promise<PasskeyNudgeResult> {
  // 1. Look up the connection and check passkey config
  if (!connectionName) {
    return { show: false };
  }

  const { connections } = await ctx.env.data.connections.list(tenantId, {
    page: 0,
    per_page: 100,
    include_totals: false,
  });

  const connection =
    connections.find((c) => c.name === connectionName) ??
    connections.find(
      (c) => c.name.toLowerCase() === connectionName.toLowerCase(),
    );

  if (!connection?.options) {
    return { show: false };
  }

  // Check progressive enrollment is enabled
  if (!connection.options.passkey_options?.progressive_enrollment_enabled) {
    return { show: false };
  }

  // Check passkey authentication method is enabled
  if (!connection.options.authentication_methods?.passkey?.enabled) {
    return { show: false };
  }

  // 2. Check if user already has a confirmed passkey enrollment
  const enrollments = await ctx.env.data.authenticationMethods.list(
    tenantId,
    userId,
  );

  const hasPasskey = enrollments.some(
    (e) => e.confirmed && PASSKEY_TYPES.includes(e.type),
  );

  if (hasPasskey) {
    return { show: false };
  }

  // 3. Check app_metadata for opt-out / snooze
  const user = await ctx.env.data.users.get(tenantId, userId);
  if (!user) {
    return { show: false };
  }

  const metadata = (user.app_metadata || {}) as Record<string, unknown>;

  if (metadata.passkey_enrollment_opted_out === true) {
    return { show: false };
  }

  if (typeof metadata.passkey_enrollment_snoozed_at === "string") {
    const snoozedAt = new Date(metadata.passkey_enrollment_snoozed_at);
    const snoozeExpiry = new Date(
      snoozedAt.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000,
    );
    if (new Date() < snoozeExpiry) {
      return { show: false };
    }
  }

  return { show: true };
}
