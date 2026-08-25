import {
  AuthParams,
  Strategy,
  StrategyType,
  isDatabaseConnectionStrategy,
} from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getOrCreateUserByProvider } from "../helpers/users";
import { createFrontChannelAuthResponse } from "./common";
import { getEnrichedClient } from "../helpers/client";
import {
  getOrCreateUsernamePasswordUser,
  isUsernamePasswordProvider,
  resolveUsernamePasswordProvider,
} from "../utils/username-password-provider";

async function getProviderFromRealm(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  realm: string,
) {
  if (realm === Strategy.USERNAME_PASSWORD) {
    return resolveUsernamePasswordProvider(ctx.env, tenant_id);
  }

  if (realm === Strategy.EMAIL) {
    return Strategy.EMAIL;
  }

  throw new JSONHTTPException(403, { message: "Invalid realm" });
}

/**
 * Drop keys whose value is `undefined` so spreading the object never blanks a
 * value the target already has. The /authorize query schema yields a key for
 * every optional parameter, so a plain spread would overwrite the stored
 * authParams with `undefined` for everything the caller left out.
 */
function omitUndefined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      Object.assign(result, { [key]: entry });
    }
  }
  return result;
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

  const provider = await getProviderFromRealm(ctx, tenant_id, realm);

  // Look up the connection to get its strategy
  const connection = client.connections.find((c) => c.name === realm);
  const strategy =
    connection?.strategy ||
    (isUsernamePasswordProvider(provider)
      ? Strategy.USERNAME_PASSWORD
      : Strategy.EMAIL);
  const strategy_type = isDatabaseConnectionStrategy(strategy)
    ? StrategyType.DATABASE
    : StrategyType.PASSWORDLESS;

  let user =
    realm === Strategy.USERNAME_PASSWORD
      ? await getOrCreateUsernamePasswordUser(ctx, {
          client,
          username: loginSession.authParams.username,
          connection: realm,
          ip: ctx.var.ip,
        })
      : await getOrCreateUserByProvider(ctx, {
          username: loginSession.authParams.username,
          provider,
          client,
          connection: realm,
          isSocial: false,
          ip: ctx.var.ip,
        });

  ctx.set("username", user.email || user.phone_number);
  ctx.set("user_id", user.user_id);

  // /authorize is the authorization request — it owns scope, audience,
  // response_type, redirect_uri, nonce, state and PKCE. /co/authenticate only
  // verified credentials and minted the ticket, so its login session carries
  // little more than the username. Merge the two with /authorize winning for
  // everything it actually specified, and persist the result: the code
  // exchange reads scope and audience back off the login session (see
  // authorizationCodeGrantUser), so a scope that lives only on this request
  // would be silently dropped — taking `offline_access`, and with it the
  // refresh token, along with it.
  const mergedAuthParams: AuthParams = {
    ...loginSession.authParams,
    ...omitUndefined(authParams),
  };

  await env.data.loginSessions.update(tenant_id, loginSession.id, {
    authParams: mergedAuthParams,
  });

  // Let createFrontChannelAuthResponse handle session creation and state transitions
  // It will authenticate the login session and create/link a session as needed
  return createFrontChannelAuthResponse(ctx, {
    authParams: mergedAuthParams,
    loginSession: { ...loginSession, authParams: mergedAuthParams },
    user,
    client,
    authConnection: realm,
    authStrategy: {
      strategy,
      strategy_type,
    },
  });
}
