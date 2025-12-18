import { Context } from "hono";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { getCookie } from "hono/cookie";
import { getClientWithDefaults } from "../../helpers/client";
import i18next from "i18next";
import { LegacyClient } from "@authhero/adapter-interfaces";
import {
  getPrimaryUserByEmail,
  getPrimaryUserByProvider,
} from "../../helpers/users";
import { RedirectException } from "../../errors/redirect-exception";
import { Bindings, Variables } from "../../types";
import { getAuthCookie } from "../../utils/cookies";

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
    throw new JSONHTTPException(400, { message: "Login session not found" });
  }

  ctx.set("loginSession", loginSession);

  const client = await getClientWithDefaults(
    env,
    loginSession.authParams.client_id,
  );
  ctx.set("client_id", client.client_id);
  ctx.set("tenant_id", client.tenant.id);

  // Check for shadcn style: query parameter takes precedence over cookie
  // Safely get cookie - getCookie requires req.raw which may not exist in tests
  let cookieStyle: string | undefined;
  try {
    cookieStyle = getCookie(ctx, "auth_ui_style");
  } catch (e) {
    // Cookie reading failed (e.g., in tests without proper request mock)
    cookieStyle = undefined;
  }

  let useShadcn = false;
  if (ctx.req?.url) {
    const url = new URL(ctx.req.url);
    const style = url.searchParams.get("style");
    const preferredStyle = style || cookieStyle || "classic";
    useShadcn = preferredStyle === "shadcn";
  }

  const tenant = await env.data.tenants.get(client.tenant.id);
  if (!tenant) {
    throw new JSONHTTPException(400, { message: "Tenant not found" });
  } else if (loginSession.session_id && !allowSession) {
    // Return redirect response with error parameters as per RFC 6749 section 4.1.2.1
    if (!loginSession.authParams.redirect_uri) {
      throw new JSONHTTPException(400, {
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

  const loginSessionLanguage = loginSession.authParams?.ui_locales
    ?.split(" ")
    ?.map((locale) => locale.split("-")[0])
    ?.find((language) => {
      if (Array.isArray(i18next.options.supportedLngs)) {
        return i18next.options.supportedLngs.includes(language);
      }
    });

  await i18next.changeLanguage(loginSessionLanguage || "en");

  return {
    theme,
    branding,
    client,
    tenant,
    loginSession,
    useShadcn,
  };
}

export async function initJSXRouteWithSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
) {
  const { theme, branding, client, tenant, loginSession, useShadcn } =
    await initJSXRoute(ctx, state, true);

  const authCookie = getAuthCookie(client.tenant.id, ctx.req.header("cookie"));

  const authSession = authCookie
    ? await ctx.env.data.sessions.get(client.tenant.id, authCookie)
    : null;

  if (!authSession || !loginSession.session_id) {
    throw new RedirectException(
      `/u/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  // Check that the user in the session matches the cookie session user
  const session = await ctx.env.data.sessions.get(
    client.tenant.id,
    loginSession.session_id,
  );

  const user = await ctx.env.data.users.get(
    client.tenant.id,
    authSession.user_id,
  );

  if (!user || session?.user_id !== authSession.user_id) {
    throw new RedirectException(
      `/u/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  return {
    theme,
    branding,
    client,
    user,
    tenant,
    loginSession,
    session,
    useShadcn,
  };
}

export type LoginStrategy = "password" | "email" | "sms";

const STRATEGY_MAP: Record<string, LoginStrategy> = {
  "Username-Password-Authentication": "password",
  email: "email",
  sms: "sms",
};

export async function getLoginStrategy(
  ctx: Context,
  client: LegacyClient,
  username: string,
  connectionType: "email" | "sms" | "username",
  login_selection?: "password" | "code",
): Promise<LoginStrategy> {
  // Explicit user selection takes priority
  if (login_selection === "password") {
    return "password";
  }
  if (login_selection === "code") {
    return connectionType === "sms" ? "sms" : "email";
  }

  // Look up user - for email use getPrimaryUserByEmail (finds any provider),
  // for sms/username use getPrimaryUserByProvider
  const user =
    connectionType === "email"
      ? await getPrimaryUserByEmail({
          userAdapter: ctx.env.data.users,
          tenant_id: client.tenant.id,
          email: username,
        })
      : await getPrimaryUserByProvider({
          userAdapter: ctx.env.data.users,
          tenant_id: client.tenant.id,
          username,
          provider: connectionType === "sms" ? "sms" : "auth2",
        });

  // Check user's preferred login method (last used)
  const userStrategy = user?.app_metadata?.strategy;
  if (userStrategy && STRATEGY_MAP[userStrategy]) {
    return STRATEGY_MAP[userStrategy];
  }

  // Get available strategies from client connections
  const availableStrategies = client.connections
    .map((c) => STRATEGY_MAP[c.strategy])
    .filter((s): s is LoginStrategy => s !== undefined);

  // If only one option is available, use it
  if (availableStrategies.length === 1 && availableStrategies[0]) {
    return availableStrategies[0];
  }

  // Multiple options available, fall back to prompt settings
  const promptSettings = await ctx.env.data.promptSettings.get(
    client.tenant.id,
  );

  if (
    promptSettings.password_first &&
    availableStrategies.includes("password")
  ) {
    return "password";
  }

  // Default to the connection type based on the identifier
  return connectionType === "sms" ? "sms" : "email";
}
