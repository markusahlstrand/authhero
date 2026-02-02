import { Context } from "hono";
import bcryptjs from "bcryptjs";
import { logMessage } from "../helpers/logging";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  AuthParams,
  LoginSession,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { Bindings, GrantFlowUserResult, Variables } from "../types";
import { getOrCreateUserByProvider, getUserByProvider } from "../helpers/users";
import { AuthError } from "../types/AuthError";
import { sendResetPassword, sendValidateEmailAddress } from "../emails";
import { stringifyAuth0Client } from "../utils/client-info";
import { createFrontChannelAuthResponse, failLoginSession } from "./common";
import {
  LOGIN_SESSION_EXPIRATION_TIME,
  PASSWORD_RESET_EXPIRATION_TIME,
} from "../constants";
import generateOTP from "../utils/otp";
import { nanoid } from "nanoid";
import {
  validatePasswordPolicy,
  getPasswordPolicy,
} from "../helpers/password-policy";

async function recordFailedLogin(
  data: Bindings["data"],
  tenantId: string,
  primaryUser: any,
): Promise<void> {
  const appMetadata = primaryUser.app_metadata || {};
  const failedLogins = appMetadata.failed_logins || [];
  const now = Date.now();

  // Add current timestamp and remove timestamps older than 5 minutes
  const recentFailedLogins = [
    ...failedLogins.filter((ts: number) => now - ts < 1000 * 60 * 5),
    now,
  ];

  appMetadata.failed_logins = recentFailedLogins;

  await data.users.update(tenantId, primaryUser.user_id, {
    app_metadata: appMetadata,
  });
}

function getRecentFailedLogins(user: any): number[] {
  const appMetadata = user.app_metadata || {};
  const failedLogins = appMetadata.failed_logins || [];
  const now = Date.now();

  // Filter to only include timestamps within the last 5 minutes
  return failedLogins.filter((ts: number) => now - ts < 1000 * 60 * 5);
}

export async function passwordGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  authParams: AuthParams & { password: string },
  loginSession?: LoginSession,
): Promise<GrantFlowUserResult> {
  const { data } = ctx.env;

  const { username } = authParams;
  ctx.set("username", username);
  if (!username) {
    throw new JSONHTTPException(400, { message: "Username is required" });
  }

  const user = await getUserByProvider({
    userAdapter: ctx.env.data.users,
    tenant_id: client.tenant.id,
    username,
    provider: "auth2",
  });

  if (!user) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
      description: "Invalid user",
    });

    // Note: Not marking session as FAILED - user can retry with correct credentials

    throw new AuthError(403, {
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const primaryUser = user.linked_to
    ? await data.users.get(client.tenant.id, user.linked_to)
    : user;

  if (!primaryUser) {
    throw new AuthError(403, {
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  ctx.set("connection", user.connection);
  ctx.set("user_id", primaryUser.user_id);

  // Check failed login attempts from app_metadata BEFORE validating password
  const recentFailedLogins = getRecentFailedLogins(primaryUser);

  if (recentFailedLogins.length >= 3) {
    logMessage(ctx, client.tenant.id, {
      // TODO: change to BLOCKED_ACCOUNT_EMAIL
      type: LogTypes.FAILED_LOGIN,
      description: "Too many failed login attempts",
    });

    // Mark login session as failed
    if (loginSession) {
      await failLoginSession(
        ctx,
        client.tenant.id,
        loginSession,
        "Too many failed login attempts",
      );
    }

    throw new AuthError(403, {
      message: "Too many failed login attempts",
      code: "TOO_MANY_FAILED_LOGINS",
    });
  }

  const password = await data.passwords.get(client.tenant.id, user.user_id);

  const valid =
    password &&
    (await bcryptjs.compare(authParams.password, password.password));

  if (!valid) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
      description: "Invalid password",
    });

    // Record failed login attempt in app_metadata
    recordFailedLogin(data, client.tenant.id, primaryUser);

    // Note: Not marking session as FAILED - user can retry with correct password

    throw new AuthError(403, {
      message: "Invalid password",
      code: "INVALID_PASSWORD",
    });
  }

  if (
    !user.email_verified &&
    client.client_metadata?.email_validation === "enforced"
  ) {
    // Extract language from ui_locales if loginSession is available
    const language = loginSession?.authParams?.ui_locales
      ?.split(" ")
      ?.map((locale) => locale.split("-")[0])[0];

    await sendValidateEmailAddress(ctx, user, language);

    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: "Email not verified",
    });

    // Mark login session as failed
    if (loginSession) {
      await failLoginSession(
        ctx,
        client.tenant.id,
        loginSession,
        "Email not verified",
      );
    }

    throw new AuthError(403, {
      message: "Email not verified",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  // Clear failed login attempts on successful password validation
  const appMetadata = primaryUser.app_metadata || {};
  if (appMetadata.failed_logins && appMetadata.failed_logins.length > 0) {
    appMetadata.failed_logins = [];
    data.users.update(client.tenant.id, primaryUser.user_id, {
      app_metadata: appMetadata,
    });
  }

  return {
    client,
    authParams,
    user: primaryUser,
    loginSession,
  };
}

export async function loginWithPassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  authParams: AuthParams & { password: string },
  loginSession?: LoginSession,
  ticketAuth?: boolean,
) {
  const result = await passwordGrant(ctx, client, authParams, loginSession);

  // Pass through to createFrontChannelAuthResponse which handles session creation
  // and calls postUserLoginHook (via completeLogin) after the session exists.
  // This ensures hooks like page redirects (impersonate) have access to the session_id.
  return createFrontChannelAuthResponse(ctx, {
    ...result,
    ticketAuth,
    authStrategy: {
      strategy: "Username-Password-Authentication",
      strategy_type: "database",
    },
  });
}

export async function changePassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  userId: string,
  newPassword: string,
  connectionName: string,
): Promise<void> {
  const { data } = ctx.env;
  const policy = await getPasswordPolicy(
    data,
    client.tenant.id,
    connectionName,
  );
  const user = await data.users.get(client.tenant.id, userId);

  if (!user) {
    throw new AuthError(404, {
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  await validatePasswordPolicy(policy, {
    tenantId: client.tenant.id,
    userId,
    newPassword,
    userData: user,
    data,
  });

  // Mark old password as not current
  const oldPassword = await data.passwords.get(client.tenant.id, userId);
  if (oldPassword) {
    await data.passwords.update(client.tenant.id, {
      id: oldPassword.id,
      user_id: userId,
      password: oldPassword.password,
      algorithm: oldPassword.algorithm,
      is_current: false,
    });
  }

  // Create new password
  await data.passwords.create(client.tenant.id, {
    user_id: userId,
    password: await bcryptjs.hash(newPassword, 10),
    algorithm: "bcrypt",
    is_current: true,
  });
}

export async function requestPasswordReset(
  ctx: Context<{
    Bindings: Bindings;
    Variables: Variables;
  }>,
  client: EnrichedClient,
  email: string,
  state: string,
) {
  // Create the user if if doesn't exist. We probably want to wait with this until the user resets the password?
  await getOrCreateUserByProvider(ctx, {
    client,
    username: email,
    provider: "auth2",
    connection: "Username-Password-Authentication",
    isSocial: false,
    ip: ctx.var.ip,
  });

  let code_id = generateOTP();
  let existingCode = await ctx.env.data.codes.get(
    client.tenant.id,
    code_id,
    "password_reset",
  );

  // This is a slighly hacky way to ensure we don't generate a code that already exists
  while (existingCode) {
    code_id = generateOTP();
    existingCode = await ctx.env.data.codes.get(
      client.tenant.id,
      code_id,
      "password_reset",
    );
  }

  const ip = ctx.get("ip");
  const useragent = ctx.get("useragent");
  const auth0_client = ctx.get("auth0_client");

  // Convert structured auth0_client back to string for storage
  const auth0Client = stringifyAuth0Client(auth0_client);

  const loginSession = await ctx.env.data.loginSessions.create(
    client.tenant.id,
    {
      expires_at: new Date(
        Date.now() + LOGIN_SESSION_EXPIRATION_TIME,
      ).toISOString(),
      authParams: {
        client_id: client.client_id,
        username: email,
      },
      csrf_token: nanoid(),
      ip,
      useragent,
      auth0Client,
    },
  );

  const createdCode = await ctx.env.data.codes.create(client.tenant.id, {
    code_id,
    code_type: "password_reset",
    login_id: loginSession.id,
    expires_at: new Date(
      Date.now() + PASSWORD_RESET_EXPIRATION_TIME,
    ).toISOString(),
  });

  await sendResetPassword(ctx, email, createdCode.code_id, state);
}
