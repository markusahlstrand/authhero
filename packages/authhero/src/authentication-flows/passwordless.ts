import { Context } from "hono";
import { AuthParams, Client } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { getClientInfo } from "../utils/client-info";
import { getUniversalLoginUrl } from "../variables";
import { isValidRedirectUrl } from "../utils/is-valid-redirect-url";
import { getPrimaryUserByEmailAndProvider } from "../helpers/users";
import { createAuthResponse } from "./common";

export async function loginWithPasswordless(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: Client,
  authParams: AuthParams,
  email: string,
  verification_code: string,
  ticketAuth?: boolean,
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

  const loginSession = await env.data.logins.get(
    client.tenant.id,
    code.login_id,
  );
  if (!loginSession || loginSession.authParams.username !== email) {
    throw new HTTPException(400, {
      message: "Code not found or expired",
    });
  }

  const clientInfo = getClientInfo(ctx.req);

  if (loginSession.ip !== clientInfo.ip) {
    return ctx.redirect(
      `${getUniversalLoginUrl(ctx.env)}invalid-session?state=${loginSession.login_id}`,
    );
  }

  if (
    authParams.redirect_uri &&
    !isValidRedirectUrl(authParams.redirect_uri, client.callbacks, {
      allowPathWildcards: true,
    })
  ) {
    throw new HTTPException(400, {
      message: `Invalid redirect URI - ${authParams.redirect_uri}`,
    });
  }

  const user = await getPrimaryUserByEmailAndProvider({
    userAdapter: env.data.users,
    tenant_id: client.tenant.id,
    email,
    provider: "email",
  });
  if (!user) {
    throw new HTTPException(400, {
      message: "User not found",
    });
  }

  await env.data.codes.used(client.tenant.id, verification_code);

  return createAuthResponse(ctx, {
    user,
    client,
    loginSession,
    authParams,
    ticketAuth,
  });
}
