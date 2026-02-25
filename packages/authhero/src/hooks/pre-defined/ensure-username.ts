import { HTTPException } from "hono/http-exception";
import { OnExecutePostLogin } from "../../types/Hooks";
import { userIdGenerate } from "../../utils/user-id";

/**
 * Check whether an error is a unique-constraint violation (HTTP 409).
 */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof HTTPException && err.status === 409;
}

export interface EnsureUsernameOptions {
  /**
   * The connection name used for username accounts.
   * @default "Username-Password-Authentication"
   */
  connection?: string;

  /**
   * The provider used for username accounts.
   * @default "auth2"
   */
  provider?: string;

  /**
   * Maximum number of attempts to find a unique username before giving up.
   * @default 10
   */
  maxRetries?: number;
}

/**
 * Slugify a string into a valid username.
 *
 * - Lowercases and normalizes unicode (NFD + strip diacritics)
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 * - Returns undefined if the result is empty
 */
export function slugify(input: string): string | undefined {
  const slug = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-") // non-alphanum → hyphen
    .replace(/-+/g, "-") // collapse consecutive hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens

  return slug.length > 0 ? slug : undefined;
}

/**
 * Extract candidate usernames from a user's profile fields.
 *
 * Tries the following fields in order:
 * 1. nickname
 * 2. name
 * 3. Local part of email (before @)
 * 4. phone_number
 *
 * Each value is slugified. Duplicates are removed while preserving order.
 */
export function extractCandidateUsernames(user: {
  nickname?: string | null;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
}): string[] {
  const raw: (string | undefined)[] = [];

  if (user.nickname) raw.push(slugify(user.nickname));
  if (user.name) raw.push(slugify(user.name));
  if (user.email) {
    const localPart = user.email.split("@")[0];
    if (localPart) raw.push(slugify(localPart));
  }
  if (user.phone_number) raw.push(slugify(user.phone_number));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of raw) {
    if (c && !seen.has(c)) {
      seen.add(c);
      candidates.push(c);
    }
  }

  return candidates;
}

/**
 * Check whether a username is already taken for a given tenant and provider.
 */
async function isUsernameTaken(
  userAdapter: { list: (tenant_id: string, params?: any) => Promise<any> },
  tenantId: string,
  username: string,
  provider: string,
): Promise<boolean> {
  const { users } = await userAdapter.list(tenantId, {
    page: 0,
    per_page: 1,
    include_totals: false,
    q: `username:${username} provider:${provider}`,
  });

  return users.length > 0;
}

/**
 * Find a unique username by appending numeric suffixes if needed.
 *
 * Given candidates `["john", "john-doe"]` it will try:
 * - john → john2 → john3 → ...
 * - john-doe → john-doe2 → john-doe3 → ...
 *
 * Returns the first available username, or undefined if none could be found
 * within the retry limit.
 */
async function findUniqueUsername(
  userAdapter: { list: (tenant_id: string, params?: any) => Promise<any> },
  tenantId: string,
  candidates: string[],
  provider: string,
  maxRetries: number,
): Promise<string | undefined> {
  for (const base of candidates) {
    // Try the base candidate first
    if (!(await isUsernameTaken(userAdapter, tenantId, base, provider))) {
      return base;
    }

    // Try numbered suffixes
    for (let i = 2; i <= maxRetries + 1; i++) {
      const candidate = `${base}${i}`;
      if (!(await isUsernameTaken(userAdapter, tenantId, candidate, provider))) {
        return candidate;
      }
    }
  }

  return undefined;
}

/**
 * Check if a user already has a username — either directly on the user
 * or via a linked identity with provider "auth2" (username connection).
 */
function userHasUsername(
  user: {
    username?: string | null;
    provider?: string;
    identities?: Array<{
      provider: string;
      profileData?: { username?: string };
    }> | null;
  },
  provider: string,
): boolean {
  // If the user itself is a username-type account with a username set
  if (user.provider === provider && user.username) {
    return true;
  }

  // Check linked identities for an existing username account
  if (user.identities) {
    return user.identities.some(
      (identity) =>
        identity.provider === provider &&
        identity.profileData?.username,
    );
  }

  return false;
}

/**
 * Creates a post-login hook that ensures every user has a username.
 *
 * **Behavior:**
 * - If the user is a username-type account (`auth2` provider), it verifies
 *   the `username` field is set. If not, it picks one from the profile fields.
 * - If the user logged in via another provider (email, social, SMS), it checks
 *   whether a linked username account already exists. If not, it creates a new
 *   username account and links it to the current user.
 *
 * **Username candidate extraction (in order):**
 * 1. `nickname`
 * 2. `name`
 * 3. Local part of `email` (before `@`)
 * 4. `phone_number`
 *
 * Each candidate is slugified (lowercased, non-alphanum replaced with hyphens).
 * If the slug is taken, numeric suffixes are tried (e.g. `john`, `john2`, `john3`).
 *
 * @example
 * ```typescript
 * import { init, preDefinedHooks } from "authhero";
 *
 * const { app } = init({
 *   dataAdapter,
 *   hooks: {
 *     onExecutePostLogin: preDefinedHooks.ensureUsername(),
 *   },
 * });
 * ```
 *
 * @example Custom connection name
 * ```typescript
 * preDefinedHooks.ensureUsername({
 *   connection: "my-username-connection",
 *   provider: "auth2",
 *   maxRetries: 20,
 * })
 * ```
 */
export function ensureUsername(
  options?: EnsureUsernameOptions,
): OnExecutePostLogin {
  const connection =
    options?.connection ?? "Username-Password-Authentication";
  const provider = options?.provider ?? "auth2";
  const maxRetries = options?.maxRetries ?? 10;

  return async (event, _api) => {
    const { ctx, user } = event;

    if (!user || !ctx) return;

    const tenantId = event.tenant?.id;
    if (!tenantId) return;

    const data = ctx.env.data;

    // Already has a username — nothing to do
    if (userHasUsername(user, provider)) {
      return;
    }

    // Extract candidate usernames from profile
    const candidates = extractCandidateUsernames(user);
    if (candidates.length === 0) {
      console.warn(
        `[ensureUsername] No username candidates found for user ${user.user_id}`,
      );
      return;
    }

    // Retry loop: find a unique username then attempt the write.
    // If a concurrent request claims the same username between our check
    // and write, the unique constraint fires a 409 and we retry.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Find a unique username
      const username = await findUniqueUsername(
        data.users,
        tenantId,
        candidates,
        provider,
        maxRetries,
      );

      if (!username) {
        console.warn(
          `[ensureUsername] Could not find a unique username for user ${user.user_id} after ${maxRetries} retries`,
        );
        return;
      }

      try {
        if (user.provider === provider) {
          // This IS a username-type account — just set the username field
          await data.users.update(tenantId, user.user_id, { username });
        } else {
          // Different provider — create a linked username account
          const usernameUserId = `${provider}|${userIdGenerate()}`;

          await data.users.create(tenantId, {
            user_id: usernameUserId,
            username,
            name: username,
            provider,
            connection,
            email_verified: false,
            is_social: false,
            linked_to: user.user_id,
          });
        }

        // Write succeeded — done
        return;
      } catch (err) {
        if (!isUniqueConstraintError(err)) {
          throw err;
        }
        // Unique constraint conflict — another request claimed this username.
        // Loop back and pick a new candidate.
        console.info(
          `[ensureUsername] Username "${username}" was claimed concurrently, retrying (attempt ${attempt + 1}/${maxRetries})`,
        );
      }
    }

    console.warn(
      `[ensureUsername] Could not allocate a username for user ${user.user_id} after ${maxRetries} conflict retries`,
    );
  };
}
