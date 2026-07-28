import {
  LinkCandidate,
  User,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { compareUsersByAge } from "./users";

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

  const normalizedEmail = user.email.toLowerCase();
  const { users: matchingUsers } = await userAdapter.list(tenantId, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${normalizedEmail}`,
  });

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
    const resolved = await userAdapter.get(tenantId, u.linked_to);
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
