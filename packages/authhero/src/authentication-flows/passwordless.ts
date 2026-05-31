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
import { getUniversalLoginUrl } from "../variables";
import { isIpMatch } from "../utils/ip";
import { t } from "i18next";
import { createFrontChannelAuthResponse } from "./common";
import { RedirectException } from "../errors/redirect-exception";
import { getEnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";

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
  username: z.string().transform((u) => u.toLowerCase()),
  otp: z.string(),
  authParams: authParamsSchema.optional(),
  enforceIpCheck: z.boolean().optional().default(false),
});

export async function passwordlessGrantUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  {
    client_id,
    username,
    otp,
    authParams,
    enforceIpCheck = false,
  }: z.input<typeof passwordlessGrantParamsSchema>,
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

  const client = await getEnrichedClient(ctx.env, client_id, ctx.var.tenant_id);

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
    },
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
