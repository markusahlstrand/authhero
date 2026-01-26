import { parseUserId } from "@authhero/adapter-interfaces";

export function userToIdentity(user: any, isPrimary: boolean = false) {
  const identity: {
    connection: string;
    provider: string;
    user_id: string;
    isSocial: boolean;
    profileData?: { [key: string]: any };
  } = {
    connection: user.connection,
    provider: user.provider,
    user_id: parseUserId(user.user_id).id,
    isSocial: Boolean(user.is_social),
  };

  // Only include profileData for linked identities, not the primary identity
  if (!isPrimary) {
    let profileData: { [key: string]: any } = {};

    try {
      profileData = JSON.parse(user.profileData || "{}");
    } catch (e) {
      console.error("Error parsing profileData", e);
    }

    identity.profileData = {
      email: user.email,
      email_verified: Boolean(user.email_verified),
      ...profileData,
    };
  }

  return identity;
}
