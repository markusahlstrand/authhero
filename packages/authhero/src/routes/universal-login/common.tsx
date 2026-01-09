import { Context } from "hono";
import { JSONHTTPException } from "../../errors/json-http-exception";
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
  };
}

export async function initJSXRouteWithSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
  options?: {
    /** If set, only allow access if the user is on this specific hook */
    allowedHook?: { type: "form" | "page" | "action"; id: string };
    /** If set, allow access when pipeline_state.current.return_to matches this value */
    allowedReturnTo?: string;
    /** If true, skip pipeline state checks (for continue endpoint) */
    skipPipelineCheck?: boolean;
  },
) {
  const { theme, branding, client, tenant, loginSession } = await initJSXRoute(
    ctx,
    state,
    true,
  );

  // The loginSession.session_id links this login flow to a session.
  // We use this to identify the user without requiring an auth cookie.
  // This is important for post-login hooks (like change-email) where
  // the user shouldn't have a valid session cookie yet.
  if (!loginSession.session_id) {
    throw new RedirectException(
      `/u/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  // Security check: If user is in the middle of a post-login hook pipeline,
  // only allow access to authorized pages. This prevents bypassing mandatory
  // hooks (like privacy policy acceptance) by directly navigating to other URLs.
  const currentHook = loginSession.pipeline_state?.current;
  if (currentHook && !options?.skipPipelineCheck) {
    const isAllowedHook =
      options?.allowedHook &&
      options.allowedHook.type === currentHook.type &&
      options.allowedHook.id === currentHook.id;

    const isAllowedReturnTo =
      options?.allowedReturnTo && currentHook.return_to === options.allowedReturnTo;

    if (!isAllowedHook && !isAllowedReturnTo) {
      // User is trying to access a page they shouldn't - redirect to their current hook
      if (currentHook.type === "form" && currentHook.step) {
        throw new RedirectException(
          `/u/forms/${currentHook.id}/nodes/${currentHook.step}?state=${encodeURIComponent(state)}`,
        );
      } else if (currentHook.type === "page") {
        throw new RedirectException(
          `/u/${currentHook.id}?state=${encodeURIComponent(state)}`,
        );
      }
      // For action hooks or unknown types, redirect to continue endpoint
      throw new RedirectException(
        `/u/continue?state=${encodeURIComponent(state)}`,
      );
    }
  }

  const session = await ctx.env.data.sessions.get(
    client.tenant.id,
    loginSession.session_id,
  );

  if (!session) {
    throw new RedirectException(
      `/u/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  const user = await ctx.env.data.users.get(client.tenant.id, session.user_id);

  if (!user) {
    throw new RedirectException(
      `/u/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  // If there's an auth cookie, verify it matches the session user (extra security check)
  const authCookie = getAuthCookie(client.tenant.id, ctx.req.header("cookie"));
  if (authCookie) {
    const authSession = await ctx.env.data.sessions.get(
      client.tenant.id,
      authCookie,
    );
    if (authSession && authSession.user_id !== session.user_id) {
      // Cookie belongs to a different user - this shouldn't happen
      throw new RedirectException(
        `/u/login/identifier?state=${encodeURIComponent(state)}`,
      );
    }
  }

  return {
    theme,
    branding,
    client,
    user,
    tenant,
    loginSession,
    session,
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
