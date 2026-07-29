import { Context } from "hono";
import { DataAdapters, LogTypes, User } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";
import { compareUsersByAge, repointPrimary } from "../../helpers/users";

/**
 * The `user` namespace exposed to `post-user-login` code hooks. `setLinkedTo`
 * is the programmable account-linking verb (issue #1184): an action reads
 * `event.link_candidates` and calls `api.user.setLinkedTo(candidate.user_id)`.
 */
export type PostLoginUserApi = {
  user: {
    setLinkedTo: (primaryUserId: string) => Promise<void>;
  };
};

/**
 * Builds the guarded `api.user.setLinkedTo` implementation for the
 * `post-user-login` trigger, plus a getter for the resulting primary user id.
 *
 * The recording proxy captures the action's `setLinkedTo(id)` call; the host
 * replays it against this implementation *after* the isolate returns
 * (`replayApiCalls`, which awaits — so the DB writes complete before the login
 * response is built).
 *
 * Guards, all enforced server-side so a malicious/buggy action cannot escalate:
 *  - **Candidate allowlist.** `primaryUserId` must be one of `candidates`
 *    (the same set serialized into `event.link_candidates`). Without this an
 *    action could link the current user to an arbitrary `user_id` —
 *    account-takeover. Rejections log `FAILED_HOOK` and mutate nothing.
 *  - **Verified-email gate.** When `requireVerifiedEmail` (the default), the
 *    logging-in user must have a verified email, regardless of what the action
 *    asserts.
 *  - **Direction.** Older account wins (`compareUsersByAge`): if the logging-in
 *    user pre-dates the target, the target is demoted via `repointPrimary`
 *    (avoiding 2-hop chains) instead.
 *  - **Idempotency.** A no-op when the user is already linked to the target.
 */
export function createPostLoginUserApi(params: {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  data: DataAdapters;
  tenantId: string;
  user: User;
  /** Resolved candidate primaries (same set as `event.link_candidates`). */
  candidates: User[];
  /** @default true */
  requireVerifiedEmail?: boolean;
}): {
  api: PostLoginUserApi;
  /** The user id of the primary after linking, or null if nothing linked. */
  getLinkedPrimaryId: () => string | null;
} {
  const { ctx, data, tenantId, candidates } = params;
  const requireVerifiedEmail = params.requireVerifiedEmail ?? true;

  // `currentUser` tracks the logging-in user's `linked_to` across multiple
  // setLinkedTo calls within one execution so repeats resolve to a no-op.
  let currentUser = params.user;
  let linkedPrimaryId: string | null = null;

  const setLinkedTo = async (primaryUserId: string): Promise<void> => {
    // Guard: only users pushed into event.link_candidates are linkable.
    const target = candidates.find((c) => c.user_id === primaryUserId);
    if (!target) {
      logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_HOOK,
        description: `post-user-login action tried to link ${currentUser.user_id} to non-candidate ${primaryUserId}`,
        userId: currentUser.user_id,
        details: {
          trigger_id: "post-user-login",
          reason: "not_a_link_candidate",
          primary_user_id: primaryUserId,
        },
      });
      return;
    }

    // Verified-email gate enforced host-side, never trusting the action.
    if (
      requireVerifiedEmail &&
      (!currentUser.email || !currentUser.email_verified)
    ) {
      logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_HOOK,
        description: `post-user-login action link refused: ${currentUser.user_id} has no verified email`,
        userId: currentUser.user_id,
        details: {
          trigger_id: "post-user-login",
          reason: "unverified_email",
          primary_user_id: primaryUserId,
        },
      });
      return;
    }

    // Idempotent: already linked to this target.
    if (currentUser.linked_to === target.user_id) {
      linkedPrimaryId = target.user_id;
      return;
    }

    // Older account wins. If the logging-in user pre-dates the target, demote
    // the target rather than turning the older user into a secondary.
    if (compareUsersByAge(currentUser, target) < 0) {
      await repointPrimary({
        userAdapter: data.users,
        tenant_id: tenantId,
        formerPrimary: target,
        newPrimaryId: currentUser.user_id,
      });
      linkedPrimaryId = currentUser.user_id;
    } else {
      // Demote the logging-in user under the (older) target. Use
      // `repointPrimary` — not a bare `linked_to` update — so any accounts
      // already linked to `currentUser` are repointed at `target`, keeping the
      // graph a single hop deep. A plain update would strand them behind a
      // now-secondary `currentUser`, producing 2-hop chains that
      // `getPrimaryUserByProvider` can't follow.
      await repointPrimary({
        userAdapter: data.users,
        tenant_id: tenantId,
        formerPrimary: currentUser,
        newPrimaryId: target.user_id,
      });
      currentUser = { ...currentUser, linked_to: target.user_id };
      linkedPrimaryId = target.user_id;
    }
  };

  return {
    api: { user: { setLinkedTo } },
    getLinkedPrimaryId: () => linkedPrimaryId,
  };
}
