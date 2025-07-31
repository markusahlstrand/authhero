import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getClientWithDefaults } from "../../helpers/client";
import i18next from "i18next";
import { Client } from "@authhero/adapter-interfaces";
import { getPrimaryUserByEmail } from "../../helpers/users";
import { RedirectException } from "../../errors/redirect-exception";
import { Bindings, Variables } from "../../types";
import { getAuthCookie } from "../../utils/cookies";
import { getAuthUrl } from "../../variables";
import { nanoid } from "nanoid";

export async function initJSXRoute(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
  allowSession = false,
) {
  const { env } = ctx;
  const loginSession = await env.data.loginSessions.get(
    ctx.var.tenant_id || "",
    state,
  );

  if (!loginSession) {
    throw new HTTPException(400, { message: "Login session not found" });
  }

  ctx.set("loginSession", loginSession);

  const client = await getClientWithDefaults(
    env,
    loginSession.authParams.client_id,
  );
  ctx.set("client_id", client.id);
  ctx.set("tenant_id", client.tenant.id);

  const tenant = await env.data.tenants.get(client.tenant.id);
  if (!tenant) {
    throw new HTTPException(400, { message: "Tenant not found" });
  } else if (loginSession.session_id && !allowSession) {
    // Return redirect response with error parameters as per RFC 6749 section 4.1.2.1
    if (!loginSession.authParams.redirect_uri) {
      throw new HTTPException(400, {
        message: "Login session closed and no redirect URI available",
      });
    }

    const redirectUrl = new URL(loginSession.authParams.redirect_uri);
    redirectUrl.searchParams.set("error", "access_denied");
    redirectUrl.searchParams.set("error_description", "Login session closed");

    // Include state parameter if it was present in the original request
    if (loginSession.authParams.state) {
      redirectUrl.searchParams.set("state", loginSession.authParams.state);
    }

    throw new RedirectException(redirectUrl.toString(), 302);
  }

  const theme = await env.data.themes.get(tenant.id, "default");
  const branding = await env.data.branding.get(tenant.id);

  const loginSessionLanguage = loginSession.authParams.ui_locales
    ?.split(" ")
    .map((locale) => locale.split("-")[0])
    .find((language) => {
      if (Array.isArray(i18next.options.supportedLngs)) {
        return i18next.options.supportedLngs.includes(language);
      }
    });

  await i18next.changeLanguage(loginSessionLanguage || tenant.language || "sv");

  return {
    theme,
    branding,
    client,
    tenant,
    loginSession,
  };
}

export async function initJSXRouteWithSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client_id: string,
) {
  const { env } = ctx;

  const client = await getClientWithDefaults(env, client_id);
  ctx.set("client_id", client.id);
  ctx.set("tenant_id", client.tenant.id);

  // Fetch the cookie
  const authCookie = getAuthCookie(client.tenant.id, ctx.req.header("cookie"));
  if (!authCookie) {
    const authorizeRedirectUrl = new URL(getAuthUrl(ctx.env));
    authorizeRedirectUrl.pathname = "/authorize";
    authorizeRedirectUrl.searchParams.set("client_id", client.id);
    authorizeRedirectUrl.searchParams.set("redirect_uri", ctx.req.url);
    authorizeRedirectUrl.searchParams.set("state", nanoid());
    throw new RedirectException(authorizeRedirectUrl.toString());
  }

  const session = await env.data.sessions.get(
    ctx.var.tenant_id || "",
    authCookie,
  );

  if (!session) {
    throw new HTTPException(400, { message: "Session not found" });
  }

  const theme = await env.data.themes.get(client.tenant.id, "default");
  const branding = await env.data.branding.get(client.tenant.id);

  const user = await env.data.users.get(client.tenant.id, session.user_id);
  if (!user) {
    throw new HTTPException(400, { message: "User not found" });
  }

  return {
    theme,
    branding,
    client,
    user,
  };
}

export async function usePasswordLogin(
  ctx: Context,
  client: Client,
  username: string,
  login_selection?: "password" | "code",
) {
  if (login_selection !== undefined) {
    return login_selection === "password";
  }

  // Get primary user for email
  const user = await getPrimaryUserByEmail({
    userAdapter: ctx.env.data.users,
    tenant_id: client.tenant.id,
    email: username,
  });

  if (user?.app_metadata.strategy) {
    return user.app_metadata.strategy === "Username-Password-Authentication";
  }

  const promptSettings = await ctx.env.data.promptSettings.get(
    client.tenant.id,
  );
  return promptSettings.password_first;
}
