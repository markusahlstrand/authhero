import { Identity, parseUserId } from "@authhero/adapter-interfaces";

const PICK_KEYS = [
  "email",
  "email_verified",
  "phone_number",
  "phone_verified",
  "username",
] as const;

export function userToIdentity(user: any, isPrimary: boolean = false): Identity {
  const identity: Identity = {
    connection: user.connection,
    provider: user.provider,
    user_id: parseUserId(user.user_id).id,
    isSocial: Boolean(user.is_social),
  };

  for (const key of PICK_KEYS) {
    if (user[key] !== undefined && user[key] !== null) {
      (identity as any)[key] = key.endsWith("_verified")
        ? Boolean(user[key])
        : user[key];
    }
  }

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
