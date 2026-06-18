import { Context } from "hono";
import bcryptjs from "bcryptjs";
import { logMessage } from "../helpers/logging";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  AuthParams,
  LoginSession,
  LogTypes,
  RateLimitDecision,
  Strategy,
  StrategyType,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { Bindings, GrantFlowUserResult, Variables } from "../types";
import {
  getOrCreateUsernamePasswordUser,
  getUsernamePasswordUser,
} from "../utils/username-password-provider";
import { validateSignupEmail } from "../hooks/validate-signup";
import { AuthError } from "../types/AuthError";
import {
  sendResetPassword,
  sendResetPasswordCode,
  sendValidateEmailAddress,
} from "../emails";
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
  hashPassword,
} from "../helpers/password-policy";
import { findConnectionByName } from "../utils/connections";
import { attemptUpstreamPasswordFallback } from "./auth0-migration";

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

function isRateLimitDecision(value: unknown): value is RateLimitDecision {
  return (
    typeof value === "object" &&
    value !== null &&
    "allowed" in value &&
    typeof value.allowed === "boolean"
  );
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
  realm: string = Strategy.USERNAME_PASSWORD,
): Promise<GrantFlowUserResult> {
  const { data } = ctx.env;

  const { username } = authParams;
  ctx.set("username", username);
  if (!username) {
    throw new JSONHTTPException(400, { message: "Username is required" });
  }

  // Pre-login throttling: short-window IP-based guard backed by
  // `data.rateLimit` (e.g. Cloudflare Workers Rate Limiter binding).
  // Honors the tenant's `suspicious_ip_throttling.enabled` flag and
  // allowlist; the binding's threshold is fixed at deploy time so the
  // tenant-configured `max_attempts` is intentionally not consulted here.
  const sip = client.tenant.attack_protection?.suspicious_ip_throttling;
  const ip = ctx.var.ip;
  const allowlisted = ip ? sip?.allowlist?.includes(ip) : false;
  if (data.rateLimit && sip?.enabled && ip && !allowlisted) {
    let decision: RateLimitDecision = { allowed: true };
    try {
      const result: unknown = await data.rateLimit.consume(
        "pre-login",
        `${client.tenant.id}:${ip}`,
      );
      if (isRateLimitDecision(result)) {
        decision = result;
      }
    } catch (error) {
      // Fail open: a misbehaving rate-limit adapter should never lock users out.
      console.error("Pre-login rate limit consume failed:", error);
    }
    if (!decision.allowed) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_LOGIN,
        description: "Rate limit exceeded for pre-login",
      });
      throw new AuthError(429, {
        message: "Too many requests",
        code: "TOO_MANY_REQUESTS",
      });
    }
  }

  let user = await getUsernamePasswordUser({
    env: ctx.env,
    tenant_id: client.tenant.id,
    username,
  });

  // Lazy migration: a DB connection flagged `import_mode: true` AND carrying
  // upstream credentials under `options.configuration` will attempt password
  // verification against upstream Auth0 when the user (or their password
  // hash) is missing locally. On success, the user/password are created
  // locally so subsequent logins are served entirely from authhero.
  if (!user) {
    // Resolve the DB connection by the requested realm (the connection the
    // login is targeting), not "any import_mode connection in the tenant".
    // This prevents a login for realm A from being verified against realm
    // B's upstream just because B happens to have import_mode enabled.
    let realmDbConnection = await findConnectionByName(
      ctx,
      client.tenant.id,
      realm,
    );
    // Universal-login callers (enter-password, login) don't know the tenant's
    // specific connection name and pass the default `Strategy.USERNAME_PASSWORD`
    // string as the realm. Connections named anything other than that literal
    // (e.g. "Password") would never resolve, so fall back to matching by
    // strategy on the client's connections in that case.
    if (!realmDbConnection && realm === Strategy.USERNAME_PASSWORD) {
      const usernamePasswordConnections = client.connections.filter(
        (c) => c.strategy === Strategy.USERNAME_PASSWORD,
      );
      if (usernamePasswordConnections.length > 1) {
        throw new JSONHTTPException(400, {
          message:
            "Multiple username-password connections configured for this client; specify an explicit realm.",
        });
      }
      realmDbConnection = usernamePasswordConnections[0] ?? null;
    }
    if (realmDbConnection?.options?.import_mode === true) {
      const migrated = await attemptUpstreamPasswordFallback({
        ctx,
        client,
        username,
        password: authParams.password,
        dbConnection: realmDbConnection,
        existingUser: null,
      });
      if (migrated) {
        user = migrated;
      }
    }

    if (!user) {
      // Auth0 logs an unknown user as `fu` (Failed Login - Invalid
      // Email/Username), distinct from `fp` (wrong password on an existing
      // user). The wrong-password branch below correctly uses `fp`.
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_LOGIN_INVALID_EMAIL_USERNAME,
        description: "Invalid user",
      });

      // Note: Not marking session as FAILED - user can retry with correct credentials

      throw new AuthError(403, {
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }
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

    // Note: Not marking login session as FAILED - the user should still be able
    // to authenticate via other methods (OTP, social login, etc.)

    throw new AuthError(403, {
      message: "Too many failed login attempts",
      code: "TOO_MANY_FAILED_LOGINS",
    });
  }

  const password = await data.passwords.get(client.tenant.id, user.user_id);

  let valid =
    password &&
    (await bcryptjs.compare(authParams.password, password.password));

  if (!valid) {
    // Try upstream lazy migration before recording a failed-login strike.
    // The user already exists locally; we just don't have a matching
    // password hash. Use the user's own connection record to read the
    // import_mode flag — only that connection's name is acceptable as the
    // upstream realm.
    const userDbConnection = await findConnectionByName(
      ctx,
      client.tenant.id,
      user.connection,
    );
    if (userDbConnection?.options?.import_mode === true) {
      const migrated = await attemptUpstreamPasswordFallback({
        ctx,
        client,
        username,
        password: authParams.password,
        dbConnection: userDbConnection,
        existingUser: primaryUser,
      });
      if (migrated) {
        valid = true;
      }
    }
  }

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
  realm: string = Strategy.USERNAME_PASSWORD,
): Promise<Response> {
  const result = await passwordGrant(
    ctx,
    client,
    authParams,
    loginSession,
    realm,
  );

  // Pass through to createFrontChannelAuthResponse which handles session creation
  // and calls postUserLoginHook (via completeLogin) after the session exists.
  // This ensures hooks like page redirects (impersonate) have access to the session_id.
  return createFrontChannelAuthResponse(ctx, {
    ...result,
    ticketAuth,
    // `authConnection` is the connection *name* actually authenticated against.
    // Use the requested `realm` (which is exactly the connection name the
    // password grant resolved against), not `ctx.get("connection")` — that
    // holds the user record's `connection`, which for a linked secondary
    // identity is the internal provider id ("auth2"), not the real connection.
    authConnection: realm,
    authStrategy: {
      strategy: Strategy.USERNAME_PASSWORD,
      strategy_type: StrategyType.DATABASE,
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
  const { hash, algorithm } = await hashPassword(newPassword);
  await data.passwords.create(client.tenant.id, {
    user_id: userId,
    password: hash,
    algorithm,
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
  verification_method?: "link" | "code",
  routePrefix?: string,
) {
  // A reset request lazily creates the native user so the emailed link has a
  // user to update. When the user doesn't exist yet, only create one if the
  // connection still permits signups — otherwise creation would throw (signup
  // disabled) and surface a raw error on the page. Stopping silently keeps the
  // UX identical whether or not the account exists, avoiding enumeration.
  const existingUser = await getUsernamePasswordUser({
    env: ctx.env,
    tenant_id: client.tenant.id,
    username: email,
  });

  if (!existingUser) {
    const passwordConnection = client.connections.find(
      (c) => c.strategy === Strategy.USERNAME_PASSWORD,
    );
    const validation = await validateSignupEmail(
      ctx,
      client,
      ctx.env.data,
      email,
      passwordConnection?.name ?? Strategy.USERNAME_PASSWORD,
    );
    if (!validation.allowed) {
      return;
    }

    await getOrCreateUsernamePasswordUser(ctx, {
      client,
      username: email,
      connection: Strategy.USERNAME_PASSWORD,
      ip: ctx.var.ip,
    });
  }

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

  // Reuse existing login session if one exists for the given state,
  // otherwise create a new one. This ensures the email link's state
  // always references a valid session that the reset-password screen can find.
  let loginSessionId = state;
  const existingSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );

  if (!existingSession) {
    const ip = ctx.get("ip");
    const useragent = ctx.get("useragent");
    const auth0_client = ctx.get("auth0_client");

    // Convert structured auth0_client back to string for storage
    const auth0Client = stringifyAuth0Client(auth0_client);

    const newSession = await ctx.env.data.loginSessions.create(
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
    loginSessionId = newSession.id;
  }

  const createdCode = await ctx.env.data.codes.create(client.tenant.id, {
    code_id,
    code_type: "password_reset",
    login_id: loginSessionId,
    expires_at: new Date(
      Date.now() + PASSWORD_RESET_EXPIRATION_TIME,
    ).toISOString(),
  });

  if (verification_method === "code") {
    await sendResetPasswordCode(ctx, email, createdCode.code_id);
  } else {
    await sendResetPassword(
      ctx,
      email,
      createdCode.code_id,
      loginSessionId,
      undefined,
      routePrefix,
    );
  }
}
