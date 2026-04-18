import { User, UserDataAdapter } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "./client";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { userIdGenerate } from "../utils/user-id";

export async function getUsersByEmail(
  userAdapter: UserDataAdapter,
  tenantId: string,
  email: string,
): Promise<User[]> {
  const response = await userAdapter.list(tenantId, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${email}`,
  });

  return response.users;
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
    userIdQuery = `phone_number:${username}`;
  } else if (username.includes("@")) {
    // Email-based lookup
    // INVARIANT: plain usernames must not contain "@", enforced by
    // baseUserSchema in adapter-interfaces. This guarantees the heuristic
    // here never misclassifies a username as an email.
    userIdQuery = `email:${username}`;
  } else {
    // Username-based lookup (no @ sign means it's a plain username)
    userIdQuery = `username:${username}`;
  }

  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `${userIdQuery} provider:${provider}`,
  });

  if (users.length > 1) {
    console.error("More than one user found for same username and provider");
  }

  return users[0] || null;
}

interface GetPrimaryUserByEmailParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  email: string;
}

export async function getPrimaryUserByEmail({
  userAdapter,
  tenant_id,
  email,
}: GetPrimaryUserByEmailParams): Promise<User | undefined> {
  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${email}`,
  });

  if (users.length === 0) {
    return;
  }

  const primaryUsers = users.filter((user) => !user.linked_to);

  if (primaryUsers.length > 0) {
    if (primaryUsers.length > 1) {
      console.error("More than one primary user found for same email");
    }

    return primaryUsers[0];
  }

  const primaryAccount = await userAdapter.get(tenant_id, users[0]?.linked_to!);

  if (!primaryAccount) {
    throw new Error("Primary account not found");
  }

  return primaryAccount;
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

  if (!user.linked_to) {
    return user;
  }

  return userAdapter.get(tenant_id, user.linked_to);
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
    username,
    provider,
    connection,
    client,
    userId,
    isSocial,
    profileData = {},
    ip = "",
    set_user_root_attributes,
  } = params;

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
    // Filter out undefined values to avoid overwriting existing data
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.env.data.users.update(
        client.tenant.id,
        user.user_id,
        filteredUpdates,
      );
      user = { ...user, ...filteredUpdates };
    }
  }

  return user;
}
