import { OnExecuteCredentialsExchange } from "../../types/Hooks";

/**
 * Resolves the username from the user's profile or linked identities.
 *
 * Lookup order:
 * 1. `user.username` — direct username on the primary user
 * 2. `user.preferred_username` — already-set preferred username
 * 3. Linked identities — finds the first identity with a `profileData.username`
 *
 * @returns The resolved username, or undefined if none found
 */
function resolveUsername(user: {
  username?: string | null;
  preferred_username?: string | null;
  identities?: Array<{
    provider: string;
    profileData?: { username?: string };
  }> | null;
}): string | undefined {
  // 1. Direct username on the user
  if (user.username) {
    return user.username;
  }

  // 2. Already has preferred_username set
  if (user.preferred_username) {
    return user.preferred_username;
  }

  // 3. Look through linked identities for a username
  if (user.identities) {
    for (const identity of user.identities) {
      if (identity.profileData?.username) {
        return identity.profileData.username;
      }
    }
  }

  return undefined;
}

/**
 * Creates a credentials-exchange hook that sets the `preferred_username`
 * claim on both access and ID tokens.
 *
 * The username is resolved from the primary user or any linked identity.
 * If no username is found, the hook does nothing.
 *
 * **Resolution order:**
 * 1. `user.username` — direct username on the primary user
 * 2. `user.preferred_username` — existing preferred_username field
 * 3. Linked identities — first identity with `profileData.username`
 *
 * @example
 * ```typescript
 * import { init, preDefinedHooks } from "authhero";
 *
 * const { app } = init({
 *   dataAdapter,
 *   hooks: {
 *     onExecuteCredentialsExchange: preDefinedHooks.setPreferredUsername(),
 *   },
 * });
 * ```
 */
export function setPreferredUsername(): OnExecuteCredentialsExchange {
  return async (event, api) => {
    const { user } = event;

    if (!user) return;

    const username = resolveUsername(user);

    if (!username) return;

    api.idToken.setCustomClaim("preferred_username", username);
    api.accessToken.setCustomClaim("preferred_username", username);
  };
}
