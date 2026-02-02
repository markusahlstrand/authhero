import { AuthParams } from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getOrCreateUserByProvider } from "../helpers/users";
import { createFrontChannelAuthResponse } from "./common";
import { getEnrichedClient } from "../helpers/client";

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

  const client = await getEnrichedClient(
    env,
    loginSession.authParams.client_id,
    tenant_id,
  );
  ctx.set("client_id", loginSession.authParams.client_id);

  await env.data.codes.used(tenant_id, ticketId);

  const provider = getProviderFromRealm(realm);

  // Look up the connection to get its strategy
  const connection = client.connections.find((c) => c.name === realm);
  const strategy =
    connection?.strategy ||
    (provider === "auth2" ? "Username-Password-Authentication" : "email");
  const strategy_type =
    strategy === "Username-Password-Authentication"
      ? "database"
      : "passwordless";

  let user = await getOrCreateUserByProvider(ctx, {
    username: loginSession.authParams.username,
    provider,
    client,
    connection: realm,
    isSocial: false,
    ip: ctx.var.ip,
  });

  ctx.set("username", user.email || user.phone_number);
  ctx.set("user_id", user.user_id);

  // Let createFrontChannelAuthResponse handle session creation and state transitions
  // It will authenticate the login session and create/link a session as needed
  return createFrontChannelAuthResponse(ctx, {
    authParams: {
      scope: loginSession.authParams?.scope,
      ...authParams,
    },
    loginSession: loginSession,
    user,
    client,
    authStrategy: {
      strategy,
      strategy_type,
    },
  });
}
