import { Context } from "hono";
import { AuthParams, Client, LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { createLogMessage } from "../utils/create-log-message";
import { nanoid } from "nanoid";
import { getClientInfo } from "../utils/client-info";
import { Bindings, Variables } from "../types";
import {
  OAUTH2_CODE_EXPIRES_IN_SECONDS,
  UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS,
} from "../constants";
import { strategies } from "../strategies";
import { setSearchParams } from "../utils/url";

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

  const options = connection.options || {};

  const strategy = strategies[connection.strategy];

  if (strategy) {
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

  // This the legacy version
  const auth2State = await ctx.env.data.codes.create(client.tenant.id, {
    login_id: loginSession.login_id,
    code_id: nanoid(),
    code_type: "oauth2_state",
    connection_id: connection.id,
    expires_at: new Date(
      Date.now() + OAUTH2_CODE_EXPIRES_IN_SECONDS * 1000,
    ).toISOString(),
  });

  const oauthLoginUrl = new URL(options.authorization_endpoint!);

  setSearchParams(oauthLoginUrl, {
    scope: options.scope,
    client_id: options.client_id,
    redirect_uri: `${ctx.env.ISSUER}callback`,
    response_type: connection.response_type,
    response_mode: connection.response_mode,
    state: auth2State.code_id,
  });

  return ctx.redirect(oauthLoginUrl.href);
}
