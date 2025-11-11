import { Context } from "hono";
import bcryptjs from "bcryptjs";
import { createLogMessage } from "../utils/create-log-message";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  AuthParams,
  LegacyClient,
  LoginSession,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { Bindings, GrantFlowUserResult, Variables } from "../types";
import { getOrCreateUserByProvider, getUserByProvider } from "../helpers/users";
import { AuthError } from "../types/AuthError";
import { sendResetPassword, sendValidateEmailAddress } from "../emails";
import { waitUntil } from "../helpers/wait-until";
import { stringifyAuth0Client } from "../utils/client-info";
import { createFrontChannelAuthResponse } from "./common";
import {
  LOGIN_SESSION_EXPIRATION_TIME,
  PASSWORD_RESET_EXPIRATION_TIME,
} from "../constants";
import generateOTP from "../utils/otp";
import { nanoid } from "nanoid";

export async function passwordGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: LegacyClient,
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
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
      description: "Invalid user",
    });

    waitUntil(ctx, data.logs.create(client.tenant.id, log));

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

  const password = await data.passwords.get(client.tenant.id, user.user_id);

  const valid =
    password &&
    (await bcryptjs.compare(authParams.password, password.password));

  if (!valid) {
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
      description: "Invalid password",
    });

    waitUntil(ctx, data.logs.create(client.tenant.id, log));

    throw new AuthError(403, {
      message: "Invalid password",
      code: "INVALID_PASSWORD",
    });
  }

  // Check the logs for failed login attempts
  const logs = await data.logs.list(client.tenant.id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `user_id:${primaryUser.user_id}`,
  });

  const failedLogins = logs.logs.filter(
    (log) =>
      log.type === LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD &&
      new Date(log.date) > new Date(Date.now() - 1000 * 60 * 5),
  );

  if (failedLogins.length >= 3) {
    const log = createLogMessage(ctx, {
      // TODO: change to BLOCKED_ACCOUNT_EMAIL
      type: LogTypes.FAILED_LOGIN,
      description: "Too many failed login attempts",
    });

    waitUntil(ctx, data.logs.create(client.tenant.id, log));

    throw new AuthError(403, {
      message: "Too many failed login attempts",
      code: "TOO_MANY_FAILED_LOGINS",
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

    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN,
      description: "Email not verified",
    });
    waitUntil(ctx, data.logs.create(client.tenant.id, log));

    throw new AuthError(403, {
      message: "Email not verified",
      code: "EMAIL_NOT_VERIFIED",
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
  client: LegacyClient,
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
    strategy: "Username-Password-Authentication",
    authStrategy: {
      strategy: "Username-Password-Authentication",
      strategy_type: "database",
    },
  });
}

export async function requestPasswordReset(
  ctx: Context<{
    Bindings: Bindings;
    Variables: Variables;
  }>,
  client: LegacyClient,
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
