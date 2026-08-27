import {
  LinkCandidate,
  User,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { compareUsersByAge, resolveClusterRootId } from "./users";
import { normalizeEmail } from "../utils/email";

/**
 * Resolve the ordered pool of candidate *primary* users that the built-in
 * email-based account-linking policy would consider for `user`, excluding the
 * user themselves.
 *
 * Mirrors the selection in `hooks/pre-defined/account-linking.ts`:
 *  - prefer direct unlinked primaries that share the (normalized) email;
 *  - otherwise resolve each secondary's `linked_to` chain to its root and
 *    dedupe, so multiple chains for the same email collapse onto one primary;
 *  - sort by age (oldest first) so duplicate-primary races converge in a single
 *    pass.
 *
 * Returns `[]` when there is nothing to link to. The first element (if any) is
 * the candidate the built-in "oldest account wins" policy would pick.
 */
export async function resolveLinkCandidates(params: {
  userAdapter: UserDataAdapter;
  tenantId: string;
  user: User;
}): Promise<User[]> {
  const { userAdapter, tenantId, user } = params;

  if (!user.email) return [];

  const normalizedEmail = normalizeEmail(user.email);

  // Fetch *every* user sharing this email — not just the first page. A single
  // fixed page could drop the oldest matching account (an email with many
  // provider identities), which would silently violate the "oldest account
  // wins" invariant the sort below relies on. Mirrors the pagination loop in
  // `linkUserTo` (helpers/users.ts).
  const pageSize = 100;
  const matchingUsers: User[] = [];
  let page = 0;
  while (true) {
    const { users } = await userAdapter.list(tenantId, {
      page,
      per_page: pageSize,
      include_totals: false,
      q: `email:${normalizedEmail}`,
    });
    matchingUsers.push(...users);
    if (users.length < pageSize) break;
    page++;
  }

  const otherUsers = matchingUsers.filter((u) => u.user_id !== user.user_id);
  if (otherUsers.length === 0) return [];

  const directPrimaries = otherUsers.filter((u) => !u.linked_to);
  if (directPrimaries.length > 0) {
    return [...directPrimaries].sort(compareUsersByAge);
  }

  // No direct primaries — resolve every secondary's linked_to chain to its
  // root and pick the roots, deduped, so multiple chains collapse onto a
  // single primary.
  const roots: User[] = [];
  const seen = new Set<string>();
  for (const u of otherUsers) {
    if (!u.linked_to) continue;
    // Walk to the actual root: a single hop can land on a row that is itself a
    // secondary, and offering that as a link candidate deepens the very chain
    // this is meant to collapse (issue #1250).
    const rootId = await resolveClusterRootId(
      userAdapter,
      tenantId,
      u.linked_to,
    );
    const resolved = await userAdapter.get(tenantId, rootId);
    if (
      resolved &&
      resolved.user_id !== user.user_id &&
      !seen.has(resolved.user_id)
    ) {
      seen.add(resolved.user_id);
      roots.push(resolved);
    }
  }

  return roots.sort(compareUsersByAge);
}

/**
 * Serialize resolved candidate primaries into the minimal, JSON-safe
 * `event.link_candidates` shape exposed to `post-user-login` code hooks. The
 * first candidate (oldest) is flagged `is_oldest` — the one the built-in policy
 * would pick.
 */
export function toLinkCandidates(candidates: User[]): LinkCandidate[] {
  const oldest = candidates[0];
  return candidates.map((c) => ({
    user_id: c.user_id,
    email: c.email ?? "",
    email_verified: c.email_verified ?? false,
    provider: c.provider ?? "",
    connection: c.connection ?? "",
    created_at: c.created_at ?? "",
    is_primary: !c.linked_to,
    is_oldest: oldest ? c.user_id === oldest.user_id : false,
  }));
}
