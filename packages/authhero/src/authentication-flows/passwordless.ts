import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { JSONHTTPException } from "../errors/json-http-exception";
import { getOrCreateUserByProvider } from "../helpers/users";
import { getConnectionFromIdentifier } from "../utils/username";
import { getUniversalLoginUrl } from "../variables";
import { isIpMatch } from "../utils/ip";
import { t } from "i18next";
import { createFrontChannelAuthResponse } from "./common";
import { RedirectException } from "../errors/redirect-exception";
import { getEnrichedClient } from "../helpers/client";

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

  const client = await getEnrichedClient(ctx.env, client_id, ctx.var.tenant_id);

  const { env } = ctx;
  const code = await env.data.codes.get(client.tenant.id, otp, "otp");

  if (!code) {
    throw new JSONHTTPException(400, {
      message: t("code_invalid"),
    });
  }

  if (code.expires_at < new Date().toISOString()) {
    throw new JSONHTTPException(400, {
      message: t("code_expired"),
    });
  }

  if (code.used_at) {
    throw new JSONHTTPException(400, {
      message: t("code_used"),
    });
  }

  const loginSession = await env.data.loginSessions.get(
    client.tenant.id,
    code.login_id,
  );

  if (!loginSession || loginSession.authParams.username !== username) {
    throw new JSONHTTPException(400, {
      message: "Code not found or expired",
    });
  }

  if (enforceIpCheck && loginSession.ip && ip) {
    if (!isIpMatch(loginSession.ip, ip)) {
      throw new RedirectException(
        `${getUniversalLoginUrl(ctx.env)}invalid-session?state=${loginSession.id}`,
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

  return createFrontChannelAuthResponse(ctx, {
    authParams: result.authParams,
    client: result.client,
    user: result.user,
    loginSession: result.loginSession,
    authStrategy: {
      strategy: "email",
      strategy_type: "passwordless",
    },
  });
}
