import { HookEvent, OnExecutePostLogin } from "../../types/Hooks";
import { getPrimaryUserByEmail } from "../../helpers/users";

export interface AccountLinkingOptions {
  /**
   * Require `email_verified` on the logged-in user before attempting to link.
   * Disabling this is almost never what you want — unverified email linking
   * lets an attacker claim existing accounts by signing up with a matching
   * email on an unverifying provider.
   * @default true
   */
  requireVerifiedEmail?: boolean;
}

/**
 * Trigger-agnostic event handler used by all `account-linking` template
 * dispatch sites. It accepts the same shape as `OnExecutePostLogin` but
 * ignores the trigger-specific `api` object, which lets the same function
 * back `post-user-login`, `post-user-registration`, and `post-user-update`.
 */
export type AccountLinkingHandler = (event: HookEvent) => Promise<void>;

/**
 * Idempotently links a user to an existing primary user with the same
 * (verified) email address. Safe to invoke from any trigger that has a
 * `user` and a `tenant.id` on the event — `post-user-login`,
 * `post-user-registration`, or `post-user-update`.
 *
 * This is the Auth0-style "Account Linking" action: customers enable it by
 * creating a template hook with `template_id: "account-linking"`. Because
 * the implementation is a no-op when linking is already correct, transient
 * failures self-heal — a later trigger simply retries the link.
 *
 * **Behavior:**
 * - No-op if the user already has `linked_to` set (already a secondary).
 * - No-op if the user has no email or `email_verified` is false (default).
 * - Looks up the primary user with the same email via
 *   `getPrimaryUserByEmail`. If found AND it's not the user themselves,
 *   sets `linked_to` on the user to point at that primary.
 * - Never unlinks; if the current user is already the primary it stays so.
 *
 * **Idempotency:** repeated calls produce the same end state.
 *
 * @example Enable as a config-level post-login hook
 * ```typescript
 * import { init, preDefinedHooks } from "authhero";
 *
 * init({
 *   dataAdapter,
 *   hooks: {
 *     onExecutePostLogin: preDefinedHooks.accountLinking(),
 *   },
 * });
 * ```
 *
 * @example Enable as a per-tenant template hook (admin API)
 * ```typescript
 * await data.hooks.create(tenantId, {
 *   trigger_id: "post-user-registration",
 *   template_id: "account-linking",
 *   enabled: true,
 * });
 * ```
 */
export function accountLinking(
  options?: AccountLinkingOptions,
): OnExecutePostLogin & AccountLinkingHandler {
  const requireVerifiedEmail = options?.requireVerifiedEmail ?? true;

  const handler = async (event: HookEvent) => {
    const { ctx, user } = event;
    if (!user || !ctx) return;

    const tenantId = event.tenant?.id;
    if (!tenantId) return;

    // Already linked — nothing to do.
    if (user.linked_to) return;

    // No email or unverified — skip to avoid account takeover via unverified
    // email on an untrusted connection.
    if (!user.email) return;
    if (requireVerifiedEmail && !user.email_verified) return;

    const data = ctx.env.data;

    const primary = await getPrimaryUserByEmail({
      userAdapter: data.users,
      tenant_id: tenantId,
      email: user.email,
    });

    if (!primary) return;

    // The user is themselves the primary — no one else to link to.
    if (primary.user_id === user.user_id) return;

    await data.users.update(tenantId, user.user_id, {
      linked_to: primary.user_id,
    });
  };

  // Cast to the dual signature so `init({ hooks: { onExecutePostLogin: ... } })`
  // and template-hook dispatch can both call the handler. The post-login api
  // argument is ignored by this implementation.
  return handler as OnExecutePostLogin & AccountLinkingHandler;
}
