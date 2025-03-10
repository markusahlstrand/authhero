import { AuthParams } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getOrCreateUserByEmailAndProvider } from "../helpers/users";
import { createAuthResponse, createSession } from "./common";

function getProviderFromRealm(realm: string) {
  if (realm === "Username-Password-Authentication") {
    return "auth2";
  }

  if (realm === "email") {
    return "email";
  }

  throw new HTTPException(403, { message: "Invalid realm" });
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
    throw new HTTPException(403, { message: "Ticket not found" });
  }

  const login = await env.data.loginSessions.get(tenant_id, code.login_id);
  if (!login || !login.authParams.username) {
    throw new HTTPException(403, { message: "Session not found" });
  }

  const client = await env.data.clients.get(login.authParams.client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }
  ctx.set("client_id", login.authParams.client_id);

  await env.data.codes.used(tenant_id, ticketId);

  const provider = getProviderFromRealm(realm);

  let user = await getOrCreateUserByEmailAndProvider(ctx, {
    email: login.authParams.username,
    provider,
    client,
    connection:
      provider === "auth2" ? "Username-Password-Authentication" : "email",
    isSocial: false,
    ip: ctx.req.header("x-real-ip"),
  });

  ctx.set("username", user.email);
  ctx.set("user_id", user.user_id);

  const session = await createSession(ctx, {
    user,
    client,
    scope: authParams.scope,
    audience: authParams.audience,
  });
  return createAuthResponse(ctx, {
    authParams: {
      scope: login.authParams?.scope,
      ...authParams,
    },
    loginSession: login,
    sessionId: session.id,
    user,
    client,
  });
}
