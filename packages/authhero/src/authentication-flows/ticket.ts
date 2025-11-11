import { AuthParams } from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getOrCreateUserByProvider } from "../helpers/users";
import { createFrontChannelAuthResponse, createSession } from "./common";

function getProviderFromRealm(realm: string) {
  if (realm === "Username-Password-Authentication") {
    return "auth2";
  }

  if (realm === "email") {
    return "email";
  }

  throw new JSONHTTPException(403, { message: "Invalid realm" });
}

export async function ticketAuth(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  ticketId: string,
  authParams: AuthParams,
  realm: string,
) {
  const { env } = ctx;

  ctx.set("connection", realm);

  const code = await env.data.codes.get(tenant_id, ticketId, "ticket");
  if (!code || code.used_at) {
    throw new JSONHTTPException(403, { message: "Ticket not found" });
  }

  const loginSession = await env.data.loginSessions.get(
    tenant_id,
    code.login_id,
  );
  if (!loginSession || !loginSession.authParams.username) {
    throw new JSONHTTPException(403, { message: "Session not found" });
  }

  const client = await env.data.legacyClients.get(
    loginSession.authParams.client_id,
  );
  if (!client) {
    throw new JSONHTTPException(403, { message: "Client not found" });
  }
  ctx.set("client_id", loginSession.authParams.client_id);

  await env.data.codes.used(tenant_id, ticketId);

  const provider = getProviderFromRealm(realm);

  let user = await getOrCreateUserByProvider(ctx, {
    username: loginSession.authParams.username,
    provider,
    client,
    connection:
      provider === "auth2" ? "Username-Password-Authentication" : "email",
    isSocial: false,
    ip: ctx.var.ip,
  });

  ctx.set("username", user.email || user.phone_number);
  ctx.set("user_id", user.user_id);

  const session = await createSession(ctx, {
    user,
    client,
    loginSession,
  });
  return createFrontChannelAuthResponse(ctx, {
    authParams: {
      scope: loginSession.authParams?.scope,
      ...authParams,
    },
    loginSession: loginSession,
    sessionId: session.id,
    user,
    client,
    strategy: "Username-Password-Authentication",
    authStrategy: {
      strategy: "Username-Password-Authentication",
      strategy_type: "database",
    },
  });
}
