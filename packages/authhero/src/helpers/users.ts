import {
  User,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "./client";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getDataAdapter } from "./data";
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
  // This handles that sms users are stored with the phone number. Username accounts are not yet handled
  const userIdQuery =
    provider === "sms" ? `phone_number:${username}` : `email:${username}`;

  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `${userIdQuery} provider:${provider}`,
  });

  if (users.length > 1) {
    console.error("More than one user found for same email and provider");
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

interface GetOrCreateUserByProviderParams {
  client: EnrichedClient;
  username: string;
  provider: string;
  connection: string;
  userId?: string;
  profileData?: Record<string, unknown>;
  ip?: string;
  isSocial: boolean;
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
  } = params;

  let user = await getPrimaryUserByProvider({
    userAdapter: ctx.env.data.users,
    tenant_id: params.client.tenant.id,
    username,
    provider,
  });

  if (!user) {
    const userData = {
      user_id: `${provider}|${userId || userIdGenerate()}`,
      email: connection !== "sms" ? username : undefined,
      phone_number: connection === "sms" ? username : undefined,
      name: username,
      provider,
      connection,
      // Assume all auth providers verify emails for now
      email_verified: true,
      last_ip: ip,
      is_social: isSocial,
      last_login: new Date().toISOString(),
      profileData: JSON.stringify(profileData),
    };

    user = await getDataAdapter(ctx).users.create(client.tenant.id, userData);

    ctx.set("user_id", user.user_id);
  }

  return user;
}
