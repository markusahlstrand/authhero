import { Context } from "hono";
import {
  AuthParams,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { JSONHTTPException } from "../errors/json-http-exception";
import { logMessage } from "../helpers/logging";
import { stringifyAuth0Client } from "../utils/client-info";
import { Bindings, Variables } from "../types";
import {
  OAUTH2_CODE_EXPIRES_IN_SECONDS,
  UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS,
} from "../constants";
import { getStrategy } from "../strategies";
import { getClientWithDefaults } from "../helpers/client";
import { getOrCreateUserByProvider } from "../helpers/users";
import { createFrontChannelAuthResponse } from "./common";
import { setTenantId } from "../helpers/set-tenant-id";
import { nanoid } from "nanoid";

export async function connectionAuth(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  connectionName: string,
  authParams: AuthParams,
) {
  if (!authParams.state) {
    throw new JSONHTTPException(400, { message: "State not found" });
  }

  const connection = client.connections.find((p) => p.name === connectionName);

  if (!connection) {
    ctx.set("client_id", client.client_id);
    await logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: "Connection not found",
    });

    throw new JSONHTTPException(403, { message: "Connection Not Found" });
  }

  let loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    authParams.state,
  );

  if (!loginSession) {
    const ip = ctx.get("ip");
    const useragent = ctx.get("useragent");
    const auth0_client = ctx.get("auth0_client");

    loginSession = await ctx.env.data.loginSessions.create(client.tenant.id, {
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      authParams,
      csrf_token: nanoid(),
      ip,
      useragent,
      auth0Client: stringifyAuth0Client(auth0_client),
    });
  }

  const strategy = getStrategy(ctx, connection.strategy);

  const result = await strategy.getRedirect(ctx, connection);

  await ctx.env.data.codes.create(client.tenant.id, {
    login_id: loginSession.id,
    code_id: result.code,
    code_type: "oauth2_state",
    connection_id: connection.id,
    code_verifier: result.codeVerifier,
    expires_at: new Date(
      Date.now() + OAUTH2_CODE_EXPIRES_IN_SECONDS * 1000,
    ).toISOString(),
  });

  // Use direct Response instead of ctx.redirect() to avoid double encoding
  return new Response(null, {
    status: 302,
    headers: {
      location: result.redirectUrl,
    },
  });
}

interface SocialAuthCallbackParams {
  code: string;
  state: string;
}

export async function connectionCallback(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { code, state }: SocialAuthCallbackParams,
) {
  const { env } = ctx;

  const auth0state = await env.data.codes.get(
    ctx.var.tenant_id || "",
    state,
    "oauth2_state",
  );
  if (!auth0state || !auth0state.connection_id) {
    throw new JSONHTTPException(403, { message: "State not found" });
  }

  const loginSession = await env.data.loginSessions.get(
    ctx.var.tenant_id || "",
    auth0state.login_id,
  );
  if (!loginSession) {
    throw new JSONHTTPException(403, { message: "Session not found" });
  }

  // Check if the login was initiated from a custom domain that doesn't match the current request
  if (loginSession.authorization_url) {
    const authorizationUrlDomain = new URL(loginSession.authorization_url)
      .hostname;
    const currentRequestDomain = ctx.var.host || "";

    // If the domains don't match and we have a custom domain in the current tenant
    if (
      authorizationUrlDomain !== currentRequestDomain &&
      authorizationUrlDomain
    ) {
      // Redirect to the same callback endpoint but on the original domain
      // Use 307 Temporary Redirect to preserve the HTTP method (POST/GET)
      const url = new URL(`https://${authorizationUrlDomain}/callback`);
      url.searchParams.set("state", state);
      url.searchParams.set("code", code);

      return new Response("Redirecting", {
        status: 307, // Temporary Redirect - preserves the HTTP method
        headers: {
          location: url.toString(),
        },
      });
    }
  }

  const client = await getClientWithDefaults(
    env,
    loginSession.authParams.client_id,
  );

  ctx.set("client_id", client.client_id);
  setTenantId(ctx, client.tenant.id);

  const connection = client.connections.find(
    (p) => p.id === auth0state.connection_id,
  );

  if (!connection) {
    await logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: "Connection not found",
    });
    throw new JSONHTTPException(403, { message: "Connection not found" });
  }

  ctx.set("connection", connection.name);

  if (!loginSession.authParams.redirect_uri) {
    await logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: "Redirect URI not defined",
    });
    throw new JSONHTTPException(403, { message: "Redirect URI not defined" });
  }

  const strategy = getStrategy(ctx, connection.strategy);

  const userinfo = await strategy.validateAuthorizationCodeAndGetUser(
    ctx,
    connection,
    code,
    auth0state.code_verifier,
  );

  const { sub, ...profileData } = userinfo;
  ctx.set("user_id", sub);

  const email =
    userinfo.email?.toLocaleLowerCase() ||
    `${connection.name}.${sub}@${new URL(ctx.env.ISSUER).hostname}`;

  ctx.set("username", email);

  const user = await getOrCreateUserByProvider(ctx, {
    client,
    username: email,
    provider: connection.strategy,
    connection: connection.name,
    userId: sub,
    profileData,
    isSocial: true,
    ip: ctx.var.ip,
  });

  return createFrontChannelAuthResponse(ctx, {
    client,
    authParams: loginSession.authParams,
    loginSession,
    user,
    authStrategy: {
      strategy: connection.strategy,
      strategy_type: "social",
    },
  });
}
