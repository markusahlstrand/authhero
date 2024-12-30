import { Context } from "hono";
import { AuthParams, Client, LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { createLogMessage } from "../utils/create-log-message";
import { getClientInfo } from "../utils/client-info";
import { Bindings, Variables } from "../types";
import {
  OAUTH2_CODE_EXPIRES_IN_SECONDS,
  UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS,
} from "../constants";
import { getStrategy } from "../strategies";
import { getClientWithDefaults } from "../helpers/client";
import { isValidRedirectUrl } from "../utils/is-valid-redirect-url";
import { getPrimaryUserByEmailAndProvider } from "../helpers/users";
import { createAuthResponse } from "./common";
import { preUserSignupHook } from "../hooks";

export async function connectionAuth(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: Client,
  connectionName: string,
  authParams: AuthParams,
) {
  if (!authParams.state) {
    throw new HTTPException(400, { message: "State not found" });
  }

  const connection = client.connections.find((p) => p.name === connectionName);

  if (!connection) {
    ctx.set("client_id", client.id);
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN,
      description: "Connection not found",
    });
    await ctx.env.data.logs.create(client.tenant.id, log);

    throw new HTTPException(403, { message: "Connection Not Found" });
  }

  let loginSession = await ctx.env.data.logins.get(
    client.tenant.id,
    authParams.state,
  );

  if (!loginSession) {
    loginSession = await ctx.env.data.logins.create(client.tenant.id, {
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      authParams,
      ...getClientInfo(ctx.req),
    });
  }

  const strategy = getStrategy(ctx, connection.strategy);

  const result = await strategy.getRedirect(ctx, connection);

  await ctx.env.data.codes.create(client.tenant.id, {
    login_id: loginSession.login_id,
    code_id: result.code,
    code_type: "oauth2_state",
    connection_id: connection.id,
    code_verifier: result.codeVerifier,
    expires_at: new Date(
      Date.now() + OAUTH2_CODE_EXPIRES_IN_SECONDS * 1000,
    ).toISOString(),
  });

  return ctx.redirect(result.redirectUrl);
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
    throw new HTTPException(403, { message: "State not found" });
  }

  const loginSession = await env.data.logins.get(
    ctx.var.tenant_id || "",
    auth0state.login_id,
  );
  if (!loginSession) {
    throw new HTTPException(403, { message: "Session not found" });
  }

  const client = await getClientWithDefaults(
    env,
    loginSession.authParams.client_id,
  );

  ctx.set("client_id", client.id);
  ctx.set("tenant_id", client.tenant.id);

  const connection = client.connections.find(
    (p) => p.id === auth0state.connection_id,
  );

  if (!connection) {
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN,
      description: "Connection not found",
    });
    await env.data.logs.create(client.tenant.id, log);
    throw new HTTPException(403, { message: "Connection not found" });
  }

  ctx.set("connection", connection.name);

  if (!loginSession.authParams.redirect_uri) {
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN,
      description: "Redirect URI not defined",
    });
    await env.data.logs.create(client.tenant.id, log);
    throw new HTTPException(403, { message: "Redirect URI not defined" });
  }

  if (
    !isValidRedirectUrl(
      loginSession.authParams.redirect_uri,
      client.callbacks || [],
    )
  ) {
    const invalidRedirectUriMessage = `Invalid redirect URI - ${loginSession.authParams.redirect_uri}`;
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN,
      description: invalidRedirectUriMessage,
    });
    await env.data.logs.create(client.tenant.id, log);
    throw new HTTPException(403, {
      message: invalidRedirectUriMessage,
    });
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

  let user = await getPrimaryUserByEmailAndProvider({
    userAdapter: env.data.users,
    tenant_id: client.tenant.id,
    email,
    provider: connection.name,
  });

  if (!user) {
    try {
      await preUserSignupHook(ctx, client, ctx.env.data, email);
    } catch (err: unknown) {
      const error = err as Error;

      throw new HTTPException(500, {
        message: `Failed to run preUserSignupHook: ${error.message}`,
      });
    }

    user = await env.data.users.create(client.tenant.id, {
      user_id: `${connection.name}|${sub}`,
      email,
      name: email,
      provider: connection.name,
      connection: connection.name,
      // Assume all auth providers verify emails for now
      email_verified: true,
      last_ip: "",
      is_social: true,
      last_login: new Date().toISOString(),
      profileData: JSON.stringify(profileData),
    });
    ctx.set("user_id", user.user_id);
  }

  return createAuthResponse(ctx, {
    client,
    authParams: loginSession.authParams,
    loginSession,
    user,
  });
}
