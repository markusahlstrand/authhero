import { DataAdapters, User } from "@authhero/adapter-interfaces";
import { getPrimaryUserByEmail } from "../helpers/users";
import { JSONHTTPException } from "../errors/json-http-exception";
import { isUniqueConstraintError } from "../errors/is-unique-constraint-error";

export interface LinkUsersResult {
  user: User;
  // False when a concurrent request already created the same user and we
  // returned the winner's row; callers use this to suppress duplicate
  // post-user-registration side effects.
  created: boolean;
}

export function linkUsersHook(data: DataAdapters) {
  return async (
    tenant_id: string,
    user: User,
  ): Promise<LinkUsersResult> => {
    try {
      const committed = await data.transaction(async (trxData) => {
        // If linked_to is not already set (e.g., from pre-user-registration hook),
        // check for email-based auto-linking
        // Normalize email to lowercase for case-insensitive matching
        const normalizedEmail = user.email?.toLowerCase();
        if (!user.linked_to && normalizedEmail && user.email_verified) {
          const primaryUser = await getPrimaryUserByEmail({
            userAdapter: trxData.users,
            tenant_id,
            email: normalizedEmail,
          });

          if (primaryUser) {
            user.linked_to = primaryUser.user_id;
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
