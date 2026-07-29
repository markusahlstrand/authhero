import { User } from "@authhero/adapter-interfaces";
import { HookEvent, OnExecutePostLogin } from "../../types/Hooks";
import { compareUsersByAge, repointPrimary } from "../../helpers/users";
import { resolveLinkCandidates } from "../../helpers/link-candidates";

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

  /**
   * When the link is performed, fill in *absent* root profile fields on the
   * primary from the secondary — e.g. a secondary that has a `birthdate` the
   * primary lacks, or a phone number an email primary doesn't carry.
   *
   * Fill-if-absent only: a field already set on the primary is never
   * overwritten (primary stays authoritative), matching `copyUserMetadata`.
   * Identifier and verification fields are never touched — `email`,
   * `email_verified`, `phone_verified`, `username`, `provider`, `connection`
   * are excluded — so this can't rewrite a login identifier. In particular an
   * sms primary already carries a `phone_number`, so its identifier is never
   * filled over; the promotion only reaches a primary that has no phone yet.
   *
   * Off by default to match Auth0, which keeps a linked identity's own
   * attributes under `identities[].profileData` rather than promoting them to
   * the merged user's root profile.
   *
   * @default false
   */
  copyProfileFields?: boolean;
}

/**
 * Root profile fields that {@link AccountLinkingOptions.copyProfileFields} may
 * fill in on the primary. Deliberately excludes every identifier/credential and
 * verification field (`email`, `email_verified`, `phone_verified`, `username`,
 * `provider`, `connection`, `linked_to`, metadata) so a profile promotion can
 * never mutate how an identity logs in.
 */
const PROMOTABLE_PROFILE_FIELDS = [
  "name",
  "given_name",
  "family_name",
  "middle_name",
  "nickname",
  "preferred_username",
  "picture",
  "profile",
  "website",
  "gender",
  "birthdate",
  "zoneinfo",
  "locale",
  "phone_number",
  "address",
] as const;

/**
 * True when `value` is "absent" for promotion purposes — undefined, null, or an
 * empty string. A field in this state on the primary may be filled from the
 * secondary; any other value is authoritative and left untouched.
 */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
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
  const copyProfileFields = options?.copyProfileFields ?? false;

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

    // Resolve the candidate primaries for this email (oldest first), excluding
    // the current user. Shared with the programmable `post-user-login` code
    // hook path so both see identical selection semantics. The built-in policy
    // picks the oldest, i.e. the first element.
    const candidates = await resolveLinkCandidates({
      userAdapter: data.users,
      tenantId,
      user,
    });
    const candidate = candidates[0];
    if (!candidate) return;

    // Older account wins. If the currently logging-in user pre-dates the
    // candidate (e.g. they registered first and a duplicate primary was
    // created later via a race), we must demote the candidate rather than
    // turning the existing user into a secondary of the newer duplicate.
    let primaryUser: User;
    let secondaryUser: User;
    if (compareUsersByAge(user, candidate) < 0) {
      primaryUser = user;
      secondaryUser = candidate;
      await repointPrimary({
        userAdapter: data.users,
        tenant_id: tenantId,
        formerPrimary: candidate,
        newPrimaryId: user.user_id,
      });
    } else {
      primaryUser = candidate;
      secondaryUser = user;
      await data.users.update(tenantId, user.user_id, {
        linked_to: candidate.user_id,
      });
    }

    if (copyUserMetadata) {
      // Some adapter `create` paths return user_metadata still serialised
      // as JSON. Normalise both sides defensively so downstream spreads
      // don't iterate string indexes.
      const secondaryMetadata = parseMetadata(secondaryUser.user_metadata);
      const primaryMetadata = parseMetadata(primaryUser.user_metadata);

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
          await data.users.update(tenantId, primaryUser.user_id, {
            user_metadata: merged,
          });
        }
      }
    }

    if (copyProfileFields) {
      // Fill absent root profile fields on the primary from the secondary.
      // Never overwrites a value already present on the primary, and only the
      // allow-listed non-identifier fields are eligible, so this can't touch a
      // login identifier (email/username) or a verification flag.
      const primaryRecord = primaryUser as unknown as Record<string, unknown>;
      const secondaryRecord = secondaryUser as unknown as Record<
        string,
        unknown
      >;
      const fills: Record<string, unknown> = {};
      for (const field of PROMOTABLE_PROFILE_FIELDS) {
        if (
          isAbsent(primaryRecord[field]) &&
          !isAbsent(secondaryRecord[field])
        ) {
          fills[field] = secondaryRecord[field];
        }
      }
      if (Object.keys(fills).length > 0) {
        await data.users.update(tenantId, primaryUser.user_id, fills);
      }
    }
  };

  // Cast to the dual signature so `init({ hooks: { onExecutePostLogin: ... } })`
  // and template-hook dispatch can both call the handler. The post-login api
  // argument is ignored by this implementation.
  return handler as OnExecutePostLogin & AccountLinkingHandler;
}
