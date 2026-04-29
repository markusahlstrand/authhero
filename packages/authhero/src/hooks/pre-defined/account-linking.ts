import { HookEvent, OnExecutePostLogin } from "../../types/Hooks";
import { getPrimaryUserByEmail } from "../../helpers/users";

/**
 * Coerce a possibly-serialised `user_metadata` blob into a plain record.
 * Some kysely-adapter code paths return the field still JSON-encoded;
 * normalising at read time keeps the merge logic agnostic to that quirk.
 */
function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export interface AccountLinkingOptions {
  /**
   * Require `email_verified` on the logged-in user before attempting to link.
   * Disabling this is almost never what you want — unverified email linking
   * lets an attacker claim existing accounts by signing up with a matching
   * email on an unverifying provider.
   * @default true
   */
  requireVerifiedEmail?: boolean;

  /**
   * When the link is performed, merge the secondary user's `user_metadata`
   * into the primary's. Existing keys on the primary are NOT overwritten —
   * only keys absent from the primary are filled in from the secondary, so
   * the primary remains the source of truth for any conflicting values.
   *
   * `app_metadata` is intentionally never copied to avoid auto-merging into
   * the admin-only namespace.
   *
   * @default false
   */
  copyUserMetadata?: boolean;
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
  const copyUserMetadata = options?.copyUserMetadata ?? false;

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

    if (copyUserMetadata) {
      // Some adapter `create` paths return user_metadata still serialised
      // as JSON. Normalise both sides defensively so downstream spreads
      // don't iterate string indexes.
      const secondaryMetadata = parseMetadata(user.user_metadata);
      const primaryMetadata = parseMetadata(primary.user_metadata);

      if (secondaryMetadata && Object.keys(secondaryMetadata).length > 0) {
        // Primary wins on conflict: merge secondary first, then overlay
        // the primary's existing values so they stay authoritative.
        const merged = {
          ...secondaryMetadata,
          ...primaryMetadata,
        };
        // Only write if the merge actually adds keys — a no-op update
        // would still bump updated_at.
        const changed = Object.keys(merged).some(
          (k) => !(k in primaryMetadata) || primaryMetadata[k] !== merged[k],
        );
        if (changed) {
          await data.users.update(tenantId, primary.user_id, {
            user_metadata: merged,
          });
        }
      }
    }
  };

  // Cast to the dual signature so `init({ hooks: { onExecutePostLogin: ... } })`
  // and template-hook dispatch can both call the handler. The post-login api
  // argument is ignored by this implementation.
  return handler as OnExecutePostLogin & AccountLinkingHandler;
}
