import { DataAdapters, User } from "@authhero/adapter-interfaces";
import { getPrimaryUserByEmail } from "../helpers/users";
import { JSONHTTPException } from "../errors/json-http-exception";
import { isUniqueConstraintError } from "../errors/is-unique-constraint-error";

export interface CommitUserResult {
  user: User;
  // False when a concurrent request already created the same user and we
  // returned the winner's row; callers use this to suppress duplicate
  // post-user-registration side effects.
  created: boolean;
}

export interface CommitUserOptions {
  /**
   * When true, attempt the legacy email-based primary lookup inside the
   * commit transaction. When the user has a verified email and no
   * `linked_to` is already set (e.g. by a pre-user-registration hook), the
   * commit will automatically point `linked_to` at the existing primary
   * user with the same email.
   *
   * Disable this to make linking opt-in via the `account-linking` template
   * hook (the current direction of travel — long-term the legacy lookup
   * goes away entirely).
   */
  resolveEmailLinkedPrimary?: boolean;
}

/**
 * Commits a new user inside a transaction. Validates `linked_to` (if set),
 * runs `rawCreate`, and recovers from concurrent-create races.
 *
 * Optionally performs the legacy email→primary auto-link lookup inside the
 * same transaction (see {@link CommitUserOptions.resolveEmailLinkedPrimary}).
 * Whether it runs is decided by the caller via
 * `builtInUserLinkingEnabled(ctx, tenant_id, client_id)`.
 */
export function commitUserHook(data: DataAdapters) {
  return async (
    tenant_id: string,
    user: User,
    options: CommitUserOptions = {},
  ): Promise<CommitUserResult> => {
    const { resolveEmailLinkedPrimary = false } = options;

    try {
      const committed = await data.transaction(async (trxData) => {
        // Optional legacy email-based linking. Runs inside the transaction so
        // the lookup, decision, and write are atomic — no TOCTOU window
        // against a concurrent create with the same email.
        if (resolveEmailLinkedPrimary && !user.linked_to) {
          const normalizedEmail = user.email?.toLowerCase();
          if (normalizedEmail && user.email_verified) {
            const primaryUser = await getPrimaryUserByEmail({
              userAdapter: trxData.users,
              tenant_id,
              email: normalizedEmail,
            });

            if (primaryUser) {
              user.linked_to = primaryUser.user_id;
            }
          }
        }

        // Validate primary exists before creating secondary to avoid dangling linked_to
        if (user.linked_to) {
          const primaryUser = await trxData.users.get(
            tenant_id,
            user.linked_to,
          );
          if (!primaryUser) {
            throw new JSONHTTPException(400, {
              error: "invalid_request",
              error_description: "Primary user does not exist",
            });
          }
        }

        // Create the user (with or without linked_to). rawCreate bypasses
        // decorator hooks — pre/post-registration hooks ran outside this
        // transaction and must never re-enter via the commit path.
        const createdUser = await trxData.users.rawCreate(tenant_id, user);

        // If linked to a primary user, return the primary with updated identities
        if (user.linked_to) {
          const primaryUser = await trxData.users.get(
            tenant_id,
            user.linked_to,
          );
          if (!primaryUser) {
            throw new JSONHTTPException(500, {
              error: "server_error",
              error_description: "Failed to fetch primary user after linking",
            });
          }
          return primaryUser;
        }

        // No linking - return the created user
        return createdUser;
      });
      return { user: committed, created: true };
    } catch (err) {
      // Race condition: another request created the same user simultaneously.
      // The transaction was rolled back, so look up the winner's user and return it.
      if (isUniqueConstraintError(err)) {
        const existingUser = await findExistingUser(data, tenant_id, user);
        if (existingUser) {
          return { user: existingUser, created: false };
        }
      }
      throw err;
    }
  };
}

/**
 * After a duplicate-key race condition, find the user that was created
 * by the competing request and return the appropriate result (following
 * linked_to to the primary user if applicable).
 */
async function findExistingUser(
  data: DataAdapters,
  tenant_id: string,
  user: User,
): Promise<User | null> {
  const q = user.email
    ? `email:${user.email.toLowerCase()}`
    : user.phone_number
      ? `phone_number:${user.phone_number}`
      : user.username
        ? `username:${user.username.toLowerCase()}`
        : null;

  if (!q) return null;

  const { users } = await data.users.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q,
  });

  const existing = users.find((u) => u.provider === user.provider);
  if (!existing) return null;

  // If the existing user is linked, return the primary (same as the happy path)
  if (existing.linked_to) {
    const primary = await data.users.get(tenant_id, existing.linked_to);
    if (!primary) {
      throw new JSONHTTPException(500, {
        error: "server_error",
        error_description: "Primary user does not exist for linked user",
      });
    }
    return primary;
  }

  return existing;
}
