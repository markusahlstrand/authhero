import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
  authParamsSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { getClientInfo } from "../utils/client-info";
import { getOrCreateUserByProvider } from "../helpers/users";
import { createAuthResponse } from "./common";
import { getConnectionFromIdentifier } from "../utils/username";
import { getUniversalLoginUrl } from "../variables";

export const passwordlessGrantParamsSchema = z.object({
  client_id: z.string(),
  username: z.string().transform((u) => u.toLowerCase()),
  otp: z.string(),
  authParams: authParamsSchema.optional(),
});

export async function passwordlessGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  {
    client_id,
    username,
    otp,
    authParams,
  }: z.infer<typeof passwordlessGrantParamsSchema>,
) {
  const clientInfo = getClientInfo(ctx.req);
  const { connectionType, normalized } = getConnectionFromIdentifier(
    username,
    clientInfo.countryCode,
  );

  if (!normalized) {
    throw new HTTPException(400, {
      message: "Invalid username format",
    });
  }

  const client = await ctx.env.data.clients.get(client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  const { env } = ctx;
  const code = await env.data.codes.get(client.tenant.id, otp, "otp");

  if (!code) {
    throw new HTTPException(400, {
      message: "Code not found or expired",
    });
  }

  if (code.expires_at < new Date().toISOString()) {
    throw new HTTPException(400, {
      message: "Code expired",
    });
  }

  if (code.used_at) {
    throw new HTTPException(400, {
      message: "Code already used",
    });
  }

  const loginSession = await env.data.loginSessions.get(
    client.tenant.id,
    code.login_id,
  );

  if (!loginSession || loginSession.authParams.username !== username) {
    throw new HTTPException(400, {
      message: "Code not found or expired",
    });
  }

  if (loginSession.ip && clientInfo.ip && loginSession.ip !== clientInfo.ip) {
    return ctx.redirect(
      `${getUniversalLoginUrl(ctx.env)}invalid-session?state=${loginSession.id}`,
    );
  }

  const user = await getOrCreateUserByProvider(ctx, {
    client,
    username: normalized,
    provider: connectionType,
    connection: connectionType,
    isSocial: false,
    ip: ctx.req.header("x-real-ip"),
  });

  await env.data.codes.used(client.tenant.id, otp);

  return createAuthResponse(ctx, {
    user,
    client,
    loginSession,
    authParams: authParams || {
      client_id,
      response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
    // ticketAuth, // add if needed
  });
}
