import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
  AuthParams,
  authParamsSchema,
  Client,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { getClientInfo } from "../utils/client-info";
import { getUniversalLoginUrl } from "../variables";
import { getOrCreateUserByProvider } from "../helpers/users";
import { createAuthResponse } from "./common";
import { getConnectionFromUsername } from "../utils/username";

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
  const client = await ctx.env.data.clients.get(client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  return loginWithPasswordless(
    ctx,
    client,
    authParams || {
      client_id,
      response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
    username,
    otp,
  );
}

// TODO: this is a legacy function. Use passwordlessGrant instead
export async function loginWithPasswordless(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: Client,
  authParams: AuthParams,
  username: string,
  verification_code: string,
  ticketAuth?: boolean,
  validateIP?: boolean,
) {
  const { env } = ctx;

  const code = await env.data.codes.get(
    client.tenant.id,
    verification_code,
    "otp",
  );

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

  const connection = getConnectionFromUsername(username);

  const loginSession = await env.data.loginSessions.get(
    client.tenant.id,
    code.login_id,
  );

  if (!loginSession || loginSession.authParams.username !== username) {
    throw new HTTPException(400, {
      message: "Code not found or expired",
    });
  }

  const clientInfo = getClientInfo(ctx.req);

  if (validateIP && loginSession.ip !== clientInfo.ip) {
    return ctx.redirect(
      `${getUniversalLoginUrl(ctx.env)}invalid-session?state=${loginSession.id}`,
    );
  }

  const user = await getOrCreateUserByProvider(ctx, {
    client,
    username,
    provider: connection,
    connection: connection,
    isSocial: false,
    ip: ctx.req.header("x-real-ip"),
  });

  await env.data.codes.used(client.tenant.id, verification_code);

  return createAuthResponse(ctx, {
    user,
    client,
    loginSession,
    authParams,
    ticketAuth,
  });
}
