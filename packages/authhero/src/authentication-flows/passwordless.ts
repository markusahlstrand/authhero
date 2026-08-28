import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import {
  authParamsSchema,
  LogTypes,
  RateLimitDecision,
  Strategy,
  StrategyType,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { JSONHTTPException } from "../errors/json-http-exception";
import { AuthError } from "../types/AuthError";
import { getOrCreateUserByProvider } from "../helpers/users";
import { getConnectionFromIdentifier } from "../utils/username";
import { normalizeEmail } from "../utils/email";
import { getUniversalLoginUrl } from "../variables";
import { isIpMatch } from "../utils/ip";
import { t } from "i18next";
import {
  authenticateLoginSession,
  createFrontChannelAuthResponse,
  createRefreshToken,
} from "./common";
import { RedirectException } from "../errors/redirect-exception";
import { getEnrichedClient, EnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { GrantFlowUserResult } from "../types/GrantFlowResult";

function isRateLimitDecision(value: unknown): value is RateLimitDecision {
  return (
    typeof value === "object" &&
    value !== null &&
    "allowed" in value &&
    typeof (value as { allowed: unknown }).allowed === "boolean"
  );
}

export const passwordlessGrantParamsSchema = z.object({
  client_id: z.string(),
  username: z.string().transform((u) => normalizeEmail(u)),
  otp: z.string(),
  // Auth0's passwordless OTP grant accepts scope and audience at exchange
  // time. They take priority over whatever /passwordless/start stored on the
  // login session, so a caller that never set them at start can still ask for
  // e.g. offline_access here.
  scope: z.string().optional(),
  audience: z.string().optional(),
  authParams: authParamsSchema.optional(),
  enforceIpCheck: z.boolean().optional().default(false),
});

export async function passwordlessGrantUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  {
    client_id,
    username,
    otp,
    scope,
    audience,
    authParams,
    enforceIpCheck = false,
  }: z.input<typeof passwordlessGrantParamsSchema>,
  preloadedClient?: EnrichedClient,
) {
  const ip = ctx.get("ip");
  const countryCode = ctx.get("countryCode");

  const { connectionType, normalized } = getConnectionFromIdentifier(
    username,
    countryCode,
  );

  if (!normalized) {
    throw new JSONHTTPException(400, {
      message: "Invalid username format",
    });
  }

  // Set the connection on context so it's available for auth_connection tracking
  // and hook connection info. Use the actual connection type (email/sms) determined
  // from the username, not the resolved primary user's connection which may differ
  // for linked accounts.
  ctx.set("connection", connectionType);

  const client =
    preloadedClient ??
    (await getEnrichedClient(ctx.env, client_id, ctx.var.tenant_id));

  const { env } = ctx;

  // Brute-force throttling: a 6-digit OTP is only ~20 bits of entropy and the
  // /verify_redirect + OTP grant accept any code value. Without a per-victim
  // quota, an attacker can sweep the 10^6 keyspace within the 10-minute window.
  // Consume one unit before the code lookup so failed guesses count too.
  if (env.data.rateLimit) {
    let decision: RateLimitDecision = { allowed: true };
    try {
      const result: unknown = await env.data.rateLimit.consume(
        "brute-force",
        `passwordless:${client.tenant.id}:${normalized}`,
      );
      if (isRateLimitDecision(result)) {
        decision = result;
      }
    } catch (error) {
      // Fail open: a misbehaving rate-limit adapter must not lock users out.
      console.error("Passwordless rate limit consume failed:", error);
    }
    if (!decision.allowed) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN,
        description: "Rate limit exceeded for passwordless OTP",
      });
      const retryAfterSeconds = decision.retryAfterSeconds;
      const body: {
        message: string;
        code: string;
        retryAfterSeconds?: number;
      } = {
        message: "Too many requests",
        code: "TOO_MANY_REQUESTS",
      };
      if (typeof retryAfterSeconds === "number") {
        body.retryAfterSeconds = retryAfterSeconds;
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (typeof retryAfterSeconds === "number") {
        headers["Retry-After"] = String(retryAfterSeconds);
      }
      throw new AuthError(429, {
        message: "Too many requests",
        code: "TOO_MANY_REQUESTS",
        res: new Response(JSON.stringify(body), {
          status: 429,
          headers,
        }),
      });
    }
  }

  const code = await env.data.codes.get(client.tenant.id, otp, "otp");

  if (!code) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN,
      description: "Code invalid",
    });
    throw new JSONHTTPException(400, {
      message: t("code_invalid"),
      userSafe: true,
    });
  }

  if (code.expires_at < new Date().toISOString()) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN,
      description: "Code expired",
      userId: code.user_id,
    });
    throw new JSONHTTPException(400, {
      message: t("code_expired"),
      userSafe: true,
    });
  }

  if (code.used_at) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN,
      description: "Code already used",
      userId: code.user_id,
    });
    throw new JSONHTTPException(400, {
      message: t("code_used"),
      userSafe: true,
    });
  }

  const loginSession = await env.data.loginSessions.get(
    client.tenant.id,
    code.login_id,
  );

  if (!loginSession || loginSession.authParams.username !== username) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN,
      description: "Login session not found or username mismatch",
      userId: code.user_id,
    });
    throw new JSONHTTPException(400, {
      message: "Code not found or expired",
      userSafe: true,
    });
  }

  if (enforceIpCheck && loginSession.ip && ip) {
    if (!isIpMatch(loginSession.ip, ip)) {
      throw new RedirectException(
        `${getUniversalLoginUrl(ctx.env, ctx.var.custom_domain)}invalid-session?state=${loginSession.id}`,
      );
    }
  }

  const user = await getOrCreateUserByProvider(ctx, {
    client,
    username: normalized,
    provider: connectionType,
    connection: connectionType,
    isSocial: false,
    ip: ctx.var.ip,
  });

  await env.data.codes.used(client.tenant.id, otp);

  return {
    user,
    client,
    loginSession,
    connectionType,
    authConnection: connectionType,
    session_id: loginSession.session_id,
    authParams: {
      ...loginSession.authParams,
      // Merge in any authParams from the request, allowing them to override
      ...(authParams || {}),
      // Top-level scope/audience from the token request win over both: they
      // are what the caller asked for on this exchange.
      ...(scope !== undefined ? { scope } : {}),
      ...(audience !== undefined ? { audience } : {}),
    },
  };
}

/**
 * The `http://auth0.com/oauth/grant-type/passwordless/otp` grant at
 * /oauth/token.
 *
 * Unlike the authorization-code exchange — where /authorize has already
 * authenticated the login session and created a session — nothing has run for
 * this login yet: /passwordless/start only stores a PENDING login session and
 * an OTP. So authenticate it here, which creates the session the auth cookie
 * and the refresh token below both hang off, then mint a refresh token when
 * `offline_access` was requested (issue #1273).
 *
 * The sibling front-channel path (`passwordlessGrant`, used by
 * /co/authenticate) does not go through here: createFrontChannelAuthResponse
 * does both steps itself, and skips the refresh token for code flows so the
 * exchange issues it instead.
 */
export async function passwordlessOtpGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.input<typeof passwordlessGrantParamsSchema>,
  preloadedClient?: EnrichedClient,
): Promise<GrantFlowUserResult> {
  const result = await passwordlessGrantUser(ctx, params, preloadedClient);

  const authStrategy = {
    strategy: result.connectionType === "sms" ? Strategy.SMS : Strategy.EMAIL,
    strategy_type: StrategyType.PASSWORDLESS,
  };

  const session_id = await authenticateLoginSession(ctx, {
    user: result.user,
    client: result.client,
    loginSession: result.loginSession,
    // Reuse the session the login session already points at, if any, rather
    // than stacking a second one on the same login.
    existingSessionId: result.loginSession.session_id,
    authConnection: result.connectionType,
    authStrategy,
  });

  let refresh_token: string | undefined;
  if (result.authParams.scope?.split(" ").includes("offline_access")) {
    const created = await createRefreshToken(ctx, {
      user: result.user,
      client: result.client,
      login_id: result.loginSession.id,
      session_id,
      organization: result.authParams.organization,
      auth_connection: result.connectionType,
      auth_strategy: authStrategy,
      scope: result.authParams.scope,
      audience: result.authParams.audience,
    });
    refresh_token = created.wireToken;
  }

  return {
    ...result,
    session_id,
    refresh_token,
  };
}

export async function passwordlessGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.input<typeof passwordlessGrantParamsSchema>,
) {
  const result = await passwordlessGrantUser(ctx, params);

  const response = await createFrontChannelAuthResponse(ctx, {
    authParams: result.authParams,
    client: result.client,
    user: result.user,
    loginSession: result.loginSession,
    authConnection: result.connectionType,
    authStrategy: {
      strategy: result.connectionType === "sms" ? Strategy.SMS : Strategy.EMAIL,
      strategy_type: StrategyType.PASSWORDLESS,
    },
  });

  // For code flow, SUCCESS_LOGIN is already emitted by the post-login hook
  // inside createFrontChannelAuthResponse — emitting it again here produces
  // a duplicate "s" log. Only the implicit flow needs the dedicated
  // OTP-exchange event since /oauth/token isn't called for it.
  const isCodeFlow = result.authParams.response_type === "code";
  if (!isCodeFlow) {
    logMessage(ctx, result.client.tenant.id, {
      type: LogTypes.SUCCESS_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN,
      userId: result.user.user_id,
      connection: result.connectionType,
      strategy: result.connectionType === "sms" ? Strategy.SMS : Strategy.EMAIL,
      strategy_type: StrategyType.PASSWORDLESS,
      scope: result.authParams.scope,
      audience: result.authParams.audience,
    });
  }

  return response;
}
