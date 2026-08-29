import {
  User,
  UserDataAdapter,
  escapeLuceneValue,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "./client";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { userIdGenerate } from "../utils/user-id";
import { isUsernamePasswordProvider } from "../utils/username-password-provider";
import { JSONHTTPException } from "../errors/json-http-exception";
import { normalizeEmail } from "../utils/email";

export async function getUsersByEmail(
  userAdapter: UserDataAdapter,
  tenantId: string,
  email: string,
): Promise<User[]> {
  const response = await userAdapter.list(tenantId, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${escapeLuceneValue(email)}`,
  });

  return response.users;
}

/**
 * Every user sharing `email`, across all pages.
 *
 * {@link getUsersByEmail} returns a single ten-row page, which is fine for the
 * Auth0-shaped `/users-by-email` endpoint but not for a uniqueness check:
 * {@link findEmailConflict} *filters* candidates by connection and cluster, so a
 * truncated page can hide the one row that genuinely conflicts and let a
 * duplicate through. An address legitimately spans many rows (one per provider
 * in a linked cluster), so ten is well within reach. Mirrors the pagination loop
 * in `resolveLinkCandidates`.
 */
export async function getAllUsersByEmail(
  userAdapter: UserDataAdapter,
  tenantId: string,
  email: string,
): Promise<User[]> {
  const pageSize = 100;
  const users: User[] = [];
  let page = 0;

  while (true) {
    const response = await userAdapter.list(tenantId, {
      page,
      per_page: pageSize,
      include_totals: false,
      q: `email:${escapeLuceneValue(email)}`,
    });
    users.push(...response.users);
    if (response.users.length < pageSize) break;
    page++;
  }

  return users;
}

interface GetUserByProviderParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  username: string;
  provider: string;
}

export async function getUserByProvider({
  userAdapter,
  tenant_id,
  username,
  provider,
}: GetUserByProviderParams): Promise<User | null> {
  let userIdQuery: string;

  if (provider === "sms") {
    userIdQuery = `phone_number:${escapeLuceneValue(username)}`;
  } else if (username.includes("@")) {
    // Email-based lookup
    // INVARIANT: plain usernames must not contain "@", enforced by
    // baseUserSchema in adapter-interfaces. This guarantees the heuristic
    // here never misclassifies a username as an email.
    userIdQuery = `email:${escapeLuceneValue(username)}`;
  } else {
    // Username-based lookup (no @ sign means it's a plain username)
    userIdQuery = `username:${escapeLuceneValue(username)}`;
  }

  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `${userIdQuery} provider:${escapeLuceneValue(provider)}`,
  });

  if (users.length > 1) {
    console.error("More than one user found for same username and provider");
  }

  return users[0] || null;
}

/**
 * Order users by age (oldest first). When account-linking has to choose
 * which of two matching users should remain primary, the older account
 * wins — it has the longer history, accrued sessions, and is most likely
 * the canonical identity the user expects to keep.
 *
 * Falls back to `user_id` so the ordering is fully deterministic when
 * `created_at` is missing or identical (e.g. fixture rows seeded in the
 * same millisecond).
 */
export function compareUsersByAge(a: User, b: User): number {
  const aTime = a.created_at
    ? new Date(a.created_at).getTime()
    : Number.MAX_SAFE_INTEGER;
  const bTime = b.created_at
    ? new Date(b.created_at).getTime()
    : Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return (a.user_id || "").localeCompare(b.user_id || "");
}

/**
 * Order users by how recently they were used to log in (most recent first).
 *
 * Distinct from {@link compareUsersByAge}: that encodes the *linking* policy
 * ("the older account is canonical"), while this answers "which of these
 * accounts is the person actually using?" — the question behind the login
 * screen's last-used-strategy hint.
 *
 * Users that have never logged in sort last. Ties fall back to
 * `compareUsersByAge` so the ordering is fully deterministic.
 */
export function compareUsersByLastLogin(a: User, b: User): number {
  const toTime = (value?: string): number => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  const aTime = toTime(a.last_login);
  const bTime = toTime(b.last_login);
  if (aTime !== bTime) return bTime - aTime;
  return compareUsersByAge(a, b);
}

interface UserExistsByEmailParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  email: string;
}

/**
 * True when any user row carries this email — primary or secondary.
 *
 * The login screens' signup gates only need to know whether an account exists
 * for the address, never which row is canonical. Asking that narrower question
 * directly (rather than via {@link getPrimaryUserByEmail}) keeps them correct
 * on tenants running with user linking off, where several unlinked primaries
 * legitimately share an email, and avoids throwing on a dangling `linked_to`.
 */
export async function userExistsByEmail({
  userAdapter,
  tenant_id,
  email,
}: UserExistsByEmailParams): Promise<boolean> {
  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 1,
    include_totals: false,
    q: `email:${escapeLuceneValue(email)}`,
  });

  return users.length > 0;
}

interface GetPrimaryUserByEmailParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  email: string;
  /**
   * Log when more than one primary shares the email. Only meaningful on
   * account-linking paths, where duplicate primaries mean linking failed to
   * converge. With `userLinkingMode: "off"` several primaries per email is the
   * expected steady state (it's Auth0's default behaviour), so read paths
   * leave this off rather than logging an error on every login.
   */
  warnOnMultiplePrimaries?: boolean;
}

export async function getPrimaryUserByEmail({
  userAdapter,
  tenant_id,
  email,
  warnOnMultiplePrimaries = false,
}: GetPrimaryUserByEmailParams): Promise<User | undefined> {
  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${escapeLuceneValue(email)}`,
  });

  if (users.length === 0) {
    return;
  }

  const primaryUsers = users.filter((user) => !user.linked_to);

  if (primaryUsers.length > 0) {
    if (warnOnMultiplePrimaries && primaryUsers.length > 1) {
      console.error("More than one primary user found for same email");
    }

    // Return the OLDEST primary so callers see the canonical account when
    // the data contains race-condition duplicates. Without this, the
    // returned primary depended on adapter list ordering and could flip
    // between calls, causing account-linking to pick the wrong direction.
    return [...primaryUsers].sort(compareUsersByAge)[0];
  }

  // Every match is a secondary — resolve the first one's chain to its root so
  // a cluster that is corrupt (deeper than one hop) still yields the canonical
  // account rather than a mid-chain row.
  const rootId = await resolveClusterRootId(
    userAdapter,
    tenant_id,
    users[0]!.linked_to!,
  );
  const primaryAccount = await userAdapter.get(tenant_id, rootId);

  if (!primaryAccount) {
    throw new Error("Primary account not found");
  }

  return primaryAccount;
}

interface GetLastUsedUserByEmailParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  email: string;
}

/**
 * The account for `email` that was most recently logged in to.
 *
 * Used for UI hints that describe *this person's habits* — chiefly the
 * last-used-strategy shortcut on the identifier screen. When linking is off, an
 * email can map to several primaries (say a password account and a Google one);
 * picking the oldest, as {@link getPrimaryUserByEmail} does, would hand back
 * whichever account they happened to create first and hint at a login method
 * they may have abandoned. Picking by `last_login` follows the account actually
 * in use.
 *
 * Deliberately *not* provider-biased: preferring the password account would
 * push habitual social users to the password screen.
 *
 * When only secondaries match, the cluster root is returned — login updates
 * land on the primary, so that's where the hint lives. Unlike
 * `getPrimaryUserByEmail` a dangling `linked_to` yields `undefined` rather than
 * throwing; callers fall back to the tenant's default strategy, which is the
 * right outcome for a hint.
 */
export async function getLastUsedUserByEmail({
  userAdapter,
  tenant_id,
  email,
}: GetLastUsedUserByEmailParams): Promise<User | undefined> {
  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${escapeLuceneValue(email)}`,
  });

  if (users.length === 0) {
    return;
  }

  const primaryUsers = users.filter((user) => !user.linked_to);

  if (primaryUsers.length > 0) {
    return [...primaryUsers].sort(compareUsersByLastLogin)[0];
  }

  const linkedTo = users[0]?.linked_to;
  if (!linkedTo) {
    return;
  }

  const rootId = await resolveClusterRootId(userAdapter, tenant_id, linkedTo);
  return (await userAdapter.get(tenant_id, rootId)) ?? undefined;
}

/**
 * Hops followed before {@link resolveClusterRootId} gives up. Correct data is
 * one hop; anything deeper is corruption, and the cap keeps a malformed graph
 * from turning a token mint into an unbounded read loop.
 */
const MAX_LINK_DEPTH = 5;

/**
 * Walk `linked_to` from `userId` to the root of its cluster.
 *
 * Correct data resolves in a single hop — {@link linkUserTo} is the only writer
 * of `linked_to` and it keeps clusters flat. This follows the chain anyway, and
 * loudly, because pre-existing rows written before that invariant was enforced
 * can still be several hops deep: degrading to the right answer beats handing a
 * caller a mid-chain identity that reads as a different person.
 *
 * Returns `userId` unchanged when it is a root, is unknown to the adapter, or
 * carries a dangling link, so callers never lose the identity they started
 * with. Cycles and over-deep chains stop at the last id reached.
 */
export async function resolveClusterRootId(
  userAdapter: UserDataAdapter,
  tenant_id: string,
  userId: string,
): Promise<string> {
  let currentId = userId;
  const visited = new Set<string>([userId]);

  for (let depth = 0; depth < MAX_LINK_DEPTH; depth++) {
    const current = await userAdapter.get(tenant_id, currentId);
    if (!current?.linked_to) return currentId;

    if (visited.has(current.linked_to)) {
      console.error(
        `linked_to cycle detected resolving ${userId}; stopping at ${currentId}`,
      );
      return currentId;
    }
    if (depth > 0) {
      console.error(
        `linked_to chain deeper than one hop resolving ${userId} (at ${current.linked_to}); the cluster needs flattening`,
      );
    }

    visited.add(current.linked_to);
    currentId = current.linked_to;
  }

  console.error(
    `linked_to chain exceeded ${MAX_LINK_DEPTH} hops resolving ${userId}; stopping at ${currentId}`,
  );
  return currentId;
}

/**
 * Resolve a user to the primary of its linked cluster, falling back to the
 * given user when the link is dangling so callers never lose the identity they
 * started with.
 *
 * This is the single resolver every read path should use — token minting
 * (authorization-code, refresh-token, silent, token-exchange, password), the
 * forms engine, and anything else that needs the canonical identity behind a
 * session. Resolving through {@link resolveClusterRootId} means a cluster that
 * is already corrupt degrades to the correct answer instead of minting a token
 * for a mid-chain `sub`.
 */
export async function resolvePrimaryUser(
  userAdapter: UserDataAdapter,
  tenant_id: string,
  user: User,
): Promise<User> {
  if (!user.linked_to) {
    return user;
  }
  const rootId = await resolveClusterRootId(
    userAdapter,
    tenant_id,
    user.linked_to,
  );
  const primary = await userAdapter.get(tenant_id, rootId);
  return primary ?? user;
}

interface LinkUserToParams {
  /**
   * Must be an *undecorated* adapter. {@link linkUserTo} is what the user-update
   * decorator's `linked_to` fast-path calls, so handing it a decorated adapter
   * would make its own writes re-enter that fast-path and recurse. Hook code
   * holding `ctx.env.data` should not call this — a plain
   * `users.update(id, { linked_to })` already routes through here.
   */
  userAdapter: UserDataAdapter;
  tenant_id: string;
  /** The user being demoted to a secondary. */
  userId: string;
  /** The intended primary. Resolved to its own cluster root first. */
  primaryId: string;
}

/**
 * Demote `userId` to a secondary of `primaryId`'s cluster — the one and only
 * way `linked_to` is ever set (issue #1250).
 *
 * Two things have to happen together for the graph to stay a single hop deep,
 * and doing either without the other silently corrupts it:
 *
 *  - **Resolve the target.** Linking onto a row that is itself a secondary
 *    would build a second hop, so the real root is resolved first.
 *  - **Repoint the children.** Any users already linked to `userId` are moved
 *    onto the root *before* `userId` is demoted. Skipping this strands them
 *    behind a now-secondary parent, where no resolver can reach them and they
 *    disappear from the API entirely.
 *
 * Callers get this for free: the decorator routes every single-field
 * `linked_to` update through here, so a bare
 * `users.update(id, { linked_to })` — from the management API, a consumer's
 * hook, or internal linking code — is safe by construction rather than by
 * remembering to call the right helper.
 *
 * Returns the cluster root `userId` was actually linked to, which may differ
 * from the requested `primaryId`.
 */
export async function linkUserTo({
  userAdapter,
  tenant_id,
  userId,
  primaryId,
}: LinkUserToParams): Promise<string> {
  if (userId === primaryId) {
    throw new JSONHTTPException(400, {
      message: "Cannot link a user to itself",
    });
  }

  const rootId = await resolveClusterRootId(userAdapter, tenant_id, primaryId);

  // The target already resolves back to the user being demoted, so this link
  // would close a loop rather than join a cluster.
  if (rootId === userId) {
    throw new JSONHTTPException(400, {
      message: "Cannot link a user to itself",
    });
  }

  // Repoint first: if this throws, `userId` is still a reachable primary and
  // its children are still reachable through it.
  await repointSecondaries(userAdapter, tenant_id, userId, rootId);

  await userAdapter.update(tenant_id, userId, { linked_to: rootId });

  return rootId;
}

/**
 * Move every user currently linked to `formerPrimaryId` onto `newPrimaryId`.
 *
 * Paginated — without this, a primary with more than one page of linked
 * accounts would leave the overflow pointing at a row that is about to become
 * a secondary, which is the exact 2-hop shape this all exists to prevent.
 */
async function repointSecondaries(
  userAdapter: UserDataAdapter,
  tenant_id: string,
  formerPrimaryId: string,
  newPrimaryId: string,
): Promise<void> {
  const pageSize = 100;
  while (true) {
    // Always read page 0: each iteration rewrites the rows it just read, so
    // they drop out of this query and the next page shifts down into it.
    const { users: secondaries } = await userAdapter.list(tenant_id, {
      page: 0,
      per_page: pageSize,
      include_totals: false,
      q: `linked_to:${escapeLuceneValue(formerPrimaryId)}`,
    });
    if (secondaries.length === 0) break;

    let written = 0;
    for (const sec of secondaries) {
      if (sec.user_id === newPrimaryId) continue;
      await userAdapter.update(tenant_id, sec.user_id, {
        linked_to: newPrimaryId,
      });
      written++;
    }
    // Only `newPrimaryId` itself was left on the page — nothing more to move.
    if (written === 0) break;
  }
}

/**
 * True for identities whose *login identifier* is the email address: the native
 * username-password providers (`auth0`/`auth2`) and the passwordless `email`
 * connection. For these, `email` is a credential — it's how the login row is
 * found (`getUserByProvider`), so it must stay consistent across a linked
 * cluster.
 *
 * Social identities carry `email` as ordinary profile data (re-synced from the
 * IdP on every login) and sms identities are keyed by `phone_number`, so neither
 * is email-identified and neither should have its `email` rewritten by a cascade.
 */
export function isEmailIdentifiedUser(
  user: Pick<User, "provider" | "connection">,
): boolean {
  if (isUsernamePasswordProvider(user.provider)) return true;
  return user.provider === "email" || user.connection === "email";
}

interface EmailConflictParams {
  /** Every user sharing the new address, as returned by {@link getUsersByEmail}. */
  candidates: User[];
  /** The identity whose email is being changed. */
  target: Pick<User, "user_id" | "provider" | "connection">;
  /**
   * The cluster root of the patched user. `target` may be the root itself or one
   * of its linked secondaries (when the caller passed `connection`).
   */
  clusterRootId: string;
}

/**
 * Find the user, if any, that genuinely blocks changing `target`'s email to an
 * address already present on other rows.
 *
 * Two rows sharing an email is only a *conflict* when it makes a login ambiguous,
 * and login lookups are always provider-scoped (`getUserByProvider` filters on
 * `email:x provider:y`). So the check is scoped the way Auth0 scopes it — per
 * connection — with one hard floor from the storage layer:
 *
 * - **Same provider** → always a conflict, cluster-mate or not. The
 *   `(tenant_id, provider, email)` unique index makes a second row with that
 *   address unrepresentable, so the write cannot succeed; a 409 is the honest
 *   answer where allowing it would surface as a constraint-violation 500.
 * - **Same connection, different provider** → a conflict *between* clusters. Two
 *   `Username-Password-Authentication` rows (the `auth0`/`auth2` pair) sharing an
 *   address are competing login rows for one credential. Unknown/custom
 *   connections are included, so tenant-specific database connections keep the
 *   protection they have today.
 * - **Different connection** → not a conflict. An `sms` identity is keyed by
 *   `phone_number` and a social identity by its provider sub, so their `email` is
 *   ordinary profile data that can't shadow an email login. This mirrors the
 *   `phone_number` carve-out on the same route (#1162) and matches Auth0, where
 *   one address may exist across connections.
 * - **Cluster-mates** (the root and its secondaries) → not a conflict, provider
 *   permitting: they are the same person, and `cascadeEmailToLinkedIdentities`
 *   deliberately converges the cluster onto one address right after this check.
 *   Because AuthHero keeps secondaries as real rows (Auth0 folds them into the
 *   primary's `identities[]`), they'd otherwise surface here as "another user".
 */
export function findEmailConflict({
  candidates,
  target,
  clusterRootId,
}: EmailConflictParams): User | undefined {
  return candidates.find((candidate) => {
    if (candidate.user_id === target.user_id) return false;
    if (candidate.provider === target.provider) return true;
    const isClusterMate =
      candidate.user_id === clusterRootId ||
      candidate.linked_to === clusterRootId;
    if (isClusterMate) return false;
    return candidate.connection === target.connection;
  });
}

interface CascadeEmailParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  /** The cluster root (primary) user_id — its secondaries are enumerated. */
  primaryUserId: string;
  /** The row whose email the caller already updated; skipped by the cascade. */
  sourceUserId: string;
  email: string;
  email_verified: boolean;
}

/**
 * Propagate an email change across every *email-identified* identity in a linked
 * cluster so a merged user keeps a single login email.
 *
 * Because account-linking matches on a shared email, at link time every
 * email-identified identity in a cluster carries the same address. The only way
 * they diverge is a later email change on one of them — and when they diverge,
 * the login row for the *other* email-identified identities still carries the
 * old address, so the user can no longer sign in with the address now shown on
 * their profile (the classic "changed my email, can't log in with my password"
 * bug).
 *
 * This re-establishes the invariant: only email-identified rows are touched
 * ({@link isEmailIdentifiedUser}); sms (`phone_number`) and social (provider
 * sub) identifiers are never rewritten. `sourceUserId` is skipped (the caller
 * already wrote it). Each cascaded write goes through the normal decorated
 * `update`, so every affected identity emits its own `user.updated` event for
 * downstream propagation, and `email_verified` moves in lock-step so the whole
 * cluster shares one verification state.
 */
export async function cascadeEmailToLinkedIdentities({
  userAdapter,
  tenant_id,
  primaryUserId,
  sourceUserId,
  email,
  email_verified,
}: CascadeEmailParams): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  const applyTo = async (member: User) => {
    if (member.user_id === sourceUserId) return;
    if (!isEmailIdentifiedUser(member)) return;
    // Skip no-op writes so we don't bump updated_at / emit a spurious event.
    // Compared normalized on both sides so a legacy row stored with stray
    // whitespace is still rewritten to the canonical form rather than skipped.
    if (
      member.email === normalizedEmail &&
      member.email_verified === email_verified
    ) {
      return;
    }
    await userAdapter.update(tenant_id, member.user_id, {
      email: normalizedEmail,
      email_verified,
    });
  };

  // The cluster root, unless it's the row the caller already updated.
  if (primaryUserId !== sourceUserId) {
    const primary = await userAdapter.get(tenant_id, primaryUserId);
    if (primary) await applyTo(primary);
  }

  // Every secondary of the primary. Paginate — a cluster can exceed one page,
  // mirroring the loop in `linkUserTo`.
  const pageSize = 100;
  let page = 0;
  while (true) {
    const { users: secondaries } = await userAdapter.list(tenant_id, {
      page,
      per_page: pageSize,
      include_totals: false,
      q: `linked_to:${escapeLuceneValue(primaryUserId)}`,
    });
    if (secondaries.length === 0) break;
    for (const sec of secondaries) {
      await applyTo(sec);
    }
    if (secondaries.length < pageSize) break;
    page++;
  }
}

interface GetPrimaryUserByProviderParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  username: string;
  provider: string;
}

export async function getPrimaryUserByProvider({
  userAdapter,
  tenant_id,
  username,
  provider,
}: GetPrimaryUserByProviderParams): Promise<User | null> {
  const user = await getUserByProvider({
    userAdapter,
    tenant_id,
    username,
    provider,
  });

  if (!user) {
    return null;
  }

  return resolvePrimaryUser(userAdapter, tenant_id, user);
}

interface RootAttributes {
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  picture?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_verified?: boolean;
}

function extractRootAttributesFromProfile(
  profileData: Record<string, unknown>,
): RootAttributes {
  const attrs: RootAttributes = {};

  if (typeof profileData.name === "string") attrs.name = profileData.name;
  if (typeof profileData.given_name === "string")
    attrs.given_name = profileData.given_name;
  if (typeof profileData.family_name === "string")
    attrs.family_name = profileData.family_name;
  if (typeof profileData.nickname === "string")
    attrs.nickname = profileData.nickname;
  if (typeof profileData.picture === "string")
    attrs.picture = profileData.picture;
  if (typeof profileData.email_verified === "boolean")
    attrs.email_verified = profileData.email_verified;
  if (typeof profileData.phone_number === "string")
    attrs.phone_number = profileData.phone_number;
  // Vipps uses "phone_number_verified", OIDC standard uses "phone_verified"
  if (typeof profileData.phone_number_verified === "boolean") {
    attrs.phone_verified = profileData.phone_number_verified;
  } else if (typeof profileData.phone_verified === "boolean") {
    attrs.phone_verified = profileData.phone_verified;
  }

  return attrs;
}

interface GetOrCreateUserByProviderParams {
  client: EnrichedClient;
  username: string;
  provider: string;
  connection: string;
  userId?: string;
  profileData?: Record<string, unknown>;
  ip?: string;
  isSocial: boolean;
  set_user_root_attributes?:
    | "on_each_login"
    | "on_first_login"
    | "never_on_login";
}

/**
 * This function will either fetch an existing user for a provider or create it
 * @param param0
 * @returns
 */
export async function getOrCreateUserByProvider(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: GetOrCreateUserByProviderParams,
): Promise<User> {
  const {
    provider,
    connection,
    client,
    userId,
    isSocial,
    profileData = {},
    ip = "",
    set_user_root_attributes,
  } = params;

  // Normalized once, before the lookup, because this function both reads and
  // (on a miss) writes: a mixed-case identifier would miss the existing row
  // and then create a duplicate. Callers arrive with identifiers of varying
  // provenance — `loginSession.authParams.username`, which can carry an
  // un-normalized `login_hint` from /authorize, or an upstream IdP profile.
  // Only "@"-bearing identifiers are emails; plain usernames (which the
  // baseUserSchema invariant forbids from containing "@") and E.164 phone
  // numbers must keep their exact form.
  const username = params.username.includes("@")
    ? normalizeEmail(params.username)
    : params.username;

  const effectiveMode = set_user_root_attributes || "on_each_login";
  const rootAttrs =
    effectiveMode !== "never_on_login"
      ? extractRootAttributesFromProfile(profileData)
      : {};

  let user = await getPrimaryUserByProvider({
    userAdapter: ctx.env.data.users,
    tenant_id: params.client.tenant.id,
    username,
    provider,
  });

  let wasCreated = false;

  if (!user) {
    const userData = {
      user_id: `${provider}|${userId || userIdGenerate()}`,
      email:
        connection !== "sms" && username.includes("@") ? username : undefined,
      phone_number: connection === "sms" ? username : rootAttrs.phone_number,
      username:
        !username.includes("@") && connection !== "sms" ? username : undefined,
      name: rootAttrs.name || username,
      given_name: rootAttrs.given_name,
      family_name: rootAttrs.family_name,
      nickname: rootAttrs.nickname,
      picture: rootAttrs.picture,
      phone_verified: rootAttrs.phone_verified,
      provider,
      connection,
      email_verified:
        rootAttrs.email_verified ?? (isSocial || connection === "email"),
      last_ip: ip,
      is_social: isSocial,
      last_login: new Date().toISOString(),
      profileData: JSON.stringify(profileData),
    };

    try {
      user = await ctx.env.data.users.create(client.tenant.id, userData);
      wasCreated = true;
    } catch (err) {
      // Concurrent social callback already created this user. Read back the
      // winner's row and fall through to the existing-user branch so the
      // login completes for both racers. createUserHooks threw before its
      // post-registration hooks ran, so the winner's flow emits the single
      // post-user-registration event.
      if ((err as { status?: unknown })?.status !== 409) {
        throw err;
      }
      const existing = await getPrimaryUserByProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        username,
        provider,
      });
      if (!existing) {
        throw err;
      }
      user = existing;
    }

    ctx.set("user_id", user.user_id);
  }

  if (!wasCreated && effectiveMode === "on_each_login") {
    const updates: Record<string, unknown> = {
      ...rootAttrs,
      profileData: JSON.stringify(profileData),
    };
    // Filter out undefined values to avoid overwriting existing data, and
    // drop fields whose stored value already matches — most logins sync an
    // unchanged profile, and skipping the no-op write saves a DB round-trip
    // on the hot path.
    const currentUser: Record<string, unknown> = { ...user };
    const changedUpdates = Object.fromEntries(
      Object.entries(updates).filter(
        ([key, value]) => value !== undefined && currentUser[key] !== value,
      ),
    );
    if (Object.keys(changedUpdates).length > 0) {
      // The merged object below is what this request uses, so the response
      // doesn't need to wait for the write — defer it past the response on
      // Workers. Without an ExecutionContext (Node, tests) stay synchronous.
      const userId = user.user_id;
      const updatePromise = ctx.env.data.users.update(
        client.tenant.id,
        userId,
        changedUpdates,
      );
      try {
        ctx.executionCtx.waitUntil(
          updatePromise.catch((err) => {
            console.error(`Deferred profile sync failed for ${userId}`, err);
          }),
        );
      } catch {
        await updatePromise;
      }
      user = { ...user, ...changedUpdates };
    }
  }

  return user;
}
