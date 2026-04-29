import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { UserLinkingMode } from "../types/AuthHeroConfig";

/**
 * Resolves the effective `UserLinkingMode` for a request, applying the
 * priority order: per-client `user_linking_mode` (highest) → service-level
 * `userLinkingMode` (set via `init`) → `"builtin"` (legacy default).
 *
 * The per-client override is read from the client referenced by
 * `ctx.var.client_id`. Management-API requests don't have a client_id and
 * therefore fall through to the service-level default.
 */
async function resolveUserLinkingMode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  client_id?: string,
): Promise<UserLinkingMode> {
  if (client_id) {
    const client = await ctx.env.data.clients.get(tenant_id, client_id);
    if (client?.user_linking_mode) {
      return client.user_linking_mode;
    }
  }
  return ctx.env.userLinkingMode ?? "builtin";
}

/**
 * Returns true when the built-in email-based linking path should run.
 *
 * The built-in path performs the legacy `getPrimaryUserByEmail` lookup at
 * user creation and email update. With `userLinkingMode: "off"` it is
 * skipped entirely and linking only happens via the `account-linking`
 * template hook.
 */
export async function builtInUserLinkingEnabled(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  client_id?: string,
): Promise<boolean> {
  const mode = await resolveUserLinkingMode(ctx, tenant_id, client_id);
  return mode === "builtin";
}
