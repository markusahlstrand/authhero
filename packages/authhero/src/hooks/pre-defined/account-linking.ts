import { OnExecutePostLogin } from "../../types/Hooks";
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
 * Post-login hook that idempotently links the logged-in user to an existing
 * primary user with the same (verified) email address.
 *
 * This is the Auth0-style "Account Linking" action: customers enable it by
 * creating a `post-user-login` template hook with `template_id:
 * "account-linking"`. Because it runs on every login and is a no-op when
 * linking is already correct, transient failures self-heal — the next login
 * simply retries the link.
 *
 * **Behavior:**
 * - No-op if the user already has `linked_to` set (already a secondary).
 * - No-op if the user has no email or `email_verified` is false (default).
 * - Looks up the primary user with the same email via
 *   `getPrimaryUserByEmail`. If found AND it's not the user themselves,
 *   sets `linked_to` on the logged-in user to point at that primary.
 * - Never unlinks; if the current user is already the primary it stays so.
 *
 * **Idempotency:** repeated calls produce the same end state. Safe to invoke
 * from the outbox relay or from `postUserLoginHook` on every login.
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
 *   trigger_id: "post-user-login",
 *   template_id: "account-linking",
 *   enabled: true,
 * });
 * ```
 */
export function accountLinking(
  options?: AccountLinkingOptions,
): OnExecutePostLogin {
  const requireVerifiedEmail = options?.requireVerifiedEmail ?? true;

  return async (event, _api) => {
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

    // The logged-in user is themselves the primary — no one else to link to.
    if (primary.user_id === user.user_id) return;

    await data.users.update(tenantId, user.user_id, {
      linked_to: primary.user_id,
    });
  };
}
