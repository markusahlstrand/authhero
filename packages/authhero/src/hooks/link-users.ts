import { DataAdapters, User } from "@authhero/adapter-interfaces";
import { getPrimaryUserByEmail } from "../helpers/users";

export function linkUsersHook(data: DataAdapters) {
  return async (tenant_id: string, user: User): Promise<User> => {
    // If the user does not have an email or the email is not verified, return the user
    if (!user.email || !user.email_verified) {
      return data.users.create(tenant_id, user);
    }

    // Search for a user with the same email
    const primaryUser = await getPrimaryUserByEmail({
      userAdapter: data.users,
      tenant_id,
      email: user.email,
    });

    // If no user with the same email exists, return the user
    if (!primaryUser) {
      return data.users.create(tenant_id, user);
    }

    await data.users.create(tenant_id, {
      ...user,
      linked_to: primaryUser.user_id,
    });

    // Fetch the primary user again to get the updated identities
    const updatedPrimaryUser = await data.users.get(
      tenant_id,
      primaryUser.user_id,
    );

    if (!updatedPrimaryUser) {
      throw new Error("Failed to fetch primary user after linking");
    }

    return updatedPrimaryUser;
  };
}
