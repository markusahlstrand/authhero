import { Client, User, UserDataAdapter } from "@authhero/adapter-interfaces";
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

interface GetUserByEmailAndProviderParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  email: string;
  provider: string;
}

export async function getUserByEmailAndProvider({
  userAdapter,
  tenant_id,
  email,
  provider,
}: GetUserByEmailAndProviderParams): Promise<User | null> {
  const { users } = await userAdapter.list(tenant_id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `email:${email} provider:${provider}`,
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
  const { users: usersWithUnverifiedPasswordAccounts } = await userAdapter.list(
    tenant_id,
    {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: `email:${email}`,
    },
  );

  // filter out unverified accounts
  const users = usersWithUnverifiedPasswordAccounts.filter(
    // maybe we should do this for all providers
    (user) => !(user.provider === "auth2" && !user.email_verified),
  );

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

  // so now we have only linked users for this email address

  // I am going to assume that all the linked users with the same email address
  // are linked to the same primary account

  const primaryAccount = await userAdapter.get(tenant_id, users[0]?.linked_to!);

  if (!primaryAccount) {
    // this is a real error where we should interrupt the flow
    throw new Error("Primary account not found");
  }

  return primaryAccount;
}

interface GetPrimaryUserByEmailAndProviderParams {
  userAdapter: UserDataAdapter;
  tenant_id: string;
  email: string;
  provider: string;
}

export async function getPrimaryUserByEmailAndProvider({
  userAdapter,
  tenant_id,
  email,
  provider,
}: GetPrimaryUserByEmailAndProviderParams): Promise<User | null> {
  const user = await getUserByEmailAndProvider({
    userAdapter,
    tenant_id,
    email,
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

interface GetOrCreateUserByEmailAndProviderParams {
  client: Client;
  email: string;
  provider: string;
  connection: string;
  userId?: string;
  profileData?: Record<string, unknown>;
}

/**
 * This function will either fetch an existing user for a provider or create it
 * @param param0
 * @returns
 */
export async function getOrCreateUserByEmailAndProvider(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: GetOrCreateUserByEmailAndProviderParams,
): Promise<User> {
  const {
    email,
    provider,
    connection,
    client,
    userId,
    profileData = {},
  } = params;

  let user = await getPrimaryUserByEmailAndProvider({
    userAdapter: ctx.env.data.users,
    tenant_id: params.client.tenant.id,
    email,
    provider,
  });

  if (!user) {
    const userData = {
      user_id: `${provider}|${userId || userIdGenerate()}`,
      email,
      name: email,
      provider,
      connection,
      // Assume all auth providers verify emails for now
      email_verified: true,
      last_ip: "",
      is_social: true,
      last_login: new Date().toISOString(),
      profileData: JSON.stringify(profileData),
    };

    user = await getDataAdapter(ctx).users.create(client.tenant.id, userData);

    ctx.set("user_id", user.user_id);
  }

  return user;
}
