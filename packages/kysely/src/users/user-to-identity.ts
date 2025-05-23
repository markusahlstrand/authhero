import { parseUserId } from "@authhero/adapter-interfaces";

export function userToIdentity(user: any) {
  let profileData: { [key: string]: string } = {};

  try {
    profileData = JSON.parse(user.profileData || "{}");
  } catch (e) {
    console.error("Error parsing profileData", e);
  }

  return {
    connection: user.connection,
    provider: user.provider,
    user_id: parseUserId(user.user_id).id,
    isSocial: Boolean(user.is_social),
    profileData: {
      email: user.email,
      email_verified: Boolean(user.email_verified),
      ...profileData,
    },
  };
}
