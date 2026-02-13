import { DataAdapters, User } from "@authhero/adapter-interfaces";
import { getPrimaryUserByEmail } from "../helpers/users";
import { JSONHTTPException } from "../errors/json-http-exception";

export function linkUsersHook(data: DataAdapters) {
  return async (tenant_id: string, user: User): Promise<User> => {
    // If linked_to is not already set (e.g., from pre-user-registration hook),
    // check for email-based auto-linking
    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = user.email?.toLowerCase();
    if (!user.linked_to && normalizedEmail && user.email_verified) {
      const primaryUser = await getPrimaryUserByEmail({
        userAdapter: data.users,
        tenant_id,
        email: normalizedEmail,
      });

      if (primaryUser) {
        user.linked_to = primaryUser.user_id;
      }
    }

    // Validate primary exists before creating secondary to avoid dangling linked_to
    if (user.linked_to) {
      const primaryUser = await data.users.get(tenant_id, user.linked_to);
      if (!primaryUser) {
        throw new JSONHTTPException(400, {
          error: "invalid_request",
          error_description: "Primary user does not exist",
        });
      }
    }

    // Create the user (with or without linked_to)
    const createdUser = await data.users.create(tenant_id, user);

    // If linked to a primary user, return the primary with updated identities
    if (user.linked_to) {
      const primaryUser = await data.users.get(tenant_id, user.linked_to);
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
  };
}

