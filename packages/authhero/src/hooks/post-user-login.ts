import { Context } from "hono";
import {
  DataAdapters,
  LogTypes,
  LoginSession,
  Strategy,
  StrategyType,
  User,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { EnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { stripInternalUserFields } from "../helpers/hook-user-payload";
import { startLoginSessionHook } from "../authentication-flows/common";
import { isFormHook, handleFormHook } from "./formhooks";
import { isPageHook, handlePageHook } from "./pagehooks";
import { isTemplateHook, handleTemplateHook } from "./templatehooks";
import { isCodeHook, handleCodeHook } from "./codehooks";
import { invokeHooks } from "./webhooks";
import { createTokenAPI } from "./helpers/token-api";

// Type guard for webhook hooks
function isWebHook(hook: any): hook is { url: string; enabled: boolean } {
  return typeof hook.url === "string";
}

/**
 * Builds an enhanced event object with Auth0-compatible properties for
 * `ctx.env.hooks.onExecutePostLogin`. The shape mirrors Auth0's post-login
 * action `event` parameter so the same action code runs on both platforms.
 */
async function buildEnhancedEventObject(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  tenant_id: string,
  user: User,
  loginSession: LoginSession,
  params: { client: EnrichedClient; authParams?: any },
) {
  // Get user roles (both global and organization-specific)
  let userRoles: string[] = [];
  try {
    const globalRoles = await data.userRoles.list(
      tenant_id,
      user.user_id,
      undefined,
      "",
    );
    const roleNames = globalRoles.map((role) => role.name || role.id);
    userRoles = roleNames;
  } catch (error) {
    console.error("Error fetching user roles:", error);
  }

  // Get connection information
  let connectionInfo: any = {};
  if (user.connection) {
    try {
      const connections = await data.connections.list(tenant_id, {
        page: 0,
        per_page: 100,
        include_totals: false,
      });
      const connection = connections.connections.find(
        (c) => c.name === user.connection,
      );
      if (connection) {
        connectionInfo = {
          id: connection.id,
          name: connection.name,
          strategy: connection.strategy || user.provider,
          metadata: connection.options || {},
        };
      }
    } catch (error) {
      console.error("Error fetching connection info:", error);
    }
  }

  // Get organization information if available
  let organizationInfo:
    | {
        id: string;
        name: string;
        display_name: string;
        metadata: any;
      }
    | undefined = undefined;
  try {
    if (loginSession.authParams?.organization) {
      const org = await data.organizations.get(
        tenant_id,
        loginSession.authParams.organization,
      );
      if (org) {
        organizationInfo = {
          id: org.id,
          name: org.name,
          display_name: org.display_name || org.name,
          metadata: org.metadata || {},
        };
      }
    }
  } catch (error) {
    console.error("Error fetching organization info:", error);
  }

  // Get countryCode from context (set by clientInfoMiddleware)
  const countryCode = ctx.get("countryCode");

  return {
    // AuthHero specific
    ctx,

    // Auth0 compatible properties
    client: params.client,
    user: stripInternalUserFields(user),
    request: {
      asn: undefined, // ASN not available in current context variables
      ip: ctx.get("ip") || "",
      user_agent: ctx.get("useragent"),
      method: ctx.req.method,
      url: ctx.req.url,
      geoip: {
        cityName: undefined,
        continentCode: undefined,
        countryCode: countryCode || undefined,
        countryName: undefined,
        latitude: undefined,
        longitude: undefined,
        timeZone: undefined,
      },
    },
    transaction: {
      id: loginSession.id, // Transaction ID - same as login session ID
      locale: loginSession.authParams?.ui_locales || "en",
      login_hint: undefined, // Not available in current authParams
      prompt: loginSession.authParams?.prompt,
      redirect_uri: loginSession.authParams?.redirect_uri,
      requested_scopes: loginSession.authParams?.scope?.split(" ") || [],
      response_mode: loginSession.authParams?.response_mode,
      response_type: loginSession.authParams?.response_type,
      state: loginSession.authParams?.state,
      ui_locales: loginSession.authParams?.ui_locales,
    },
    scope: params.authParams?.scope || "",
    grant_type: params.authParams?.grant_type || "",
    audience: params.authParams?.audience,

    // Additional Auth0 event properties
    authentication: {
      methods: [
        {
          name: user.is_social ? "federated" : "pwd",
          timestamp: new Date().toISOString(),
        },
      ],
    },
    authorization: {
      roles: userRoles,
    },
    connection:
      Object.keys(connectionInfo).length > 0
        ? connectionInfo
        : {
            id: user.connection || Strategy.USERNAME_PASSWORD,
            name: user.connection || Strategy.USERNAME_PASSWORD,
            strategy: user.provider || "auth0",
          },
    organization: organizationInfo,
    resource_server: params.authParams?.audience
      ? {
          identifier: params.authParams.audience,
        }
      : undefined,
    stats: {
      logins_count: user.login_count || 0,
    },
    tenant: {
      id: tenant_id,
    },
    session: {
      id: loginSession.id,
      created_at: loginSession.created_at,
      authenticated_at: new Date().toISOString(),
      clients: [
        {
          client_id: params.client.client_id,
        },
      ],
      device: {
        initial_ip: ctx.get("ip"),
        initial_user_agent: ctx.get("useragent"),
        last_ip: user.last_ip || ctx.get("ip"),
        last_user_agent: ctx.get("useragent"),
      },
    },
  };
}

/**
 * Checks for post-user-login hooks (form, page, template, code, or webhook)
 * and handles them in that order. Also:
 *  - logs the successful login,
 *  - increments the user's `login_count`.
 *
 * Delivery reliability for `post-user-registration` is the outbox's concern
 * (retry + dead-letter), not the login path's. Recovery of dead-lettered
 * events is a separate admin/cron responsibility so a user's first login
 * can't double-enqueue while the original event is still pending.
 *
 * Returns either the (possibly updated) user or a `Response` when a hook
 * redirects, takes over the login, or renders a form.
 */
export async function postUserLoginHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  tenant_id: string,
  user: User,
  loginSession?: LoginSession,
  params?: {
    client?: EnrichedClient;
    authParams?: any;
    authStrategy?: { strategy: string; strategy_type: string };
  },
): Promise<User | Response> {
  // Determine strategy_type based on explicit auth strategy or user's is_social flag
  // Use authStrategy if provided (actual authentication method), otherwise infer from user
  const strategy_type = params?.authStrategy?.strategy_type
    ? params.authStrategy.strategy_type
    : user.is_social
      ? StrategyType.SOCIAL
      : StrategyType.DATABASE;
  const strategy = params?.authStrategy?.strategy || user.connection || "";

  // Log successful login
  logMessage(ctx, tenant_id, {
    type: LogTypes.SUCCESS_LOGIN,
    description: `Successful login for ${user.user_id}`,
    userId: user.user_id,
    strategy_type,
    strategy,
    connection: strategy, // Use the same value for both strategy and connection
    audience: params?.authParams?.audience,
    scope: params?.authParams?.scope,
  });

  // Update the user's last login info
  await data.users.update(tenant_id, user.user_id, {
    last_login: new Date().toISOString(),
    last_ip: ctx.var.ip || "",
    login_count: user.login_count + 1,
  });

  // Trigger any onExecutePostLogin hooks defined in ctx.env.hooks
  if (
    ctx.env.hooks?.onExecutePostLogin &&
    params?.client &&
    params?.authParams &&
    loginSession
  ) {
    let redirectUrl: string | null = null;

    // Build enhanced event object with Auth0 compatibility
    const eventObject = await buildEnhancedEventObject(
      ctx,
      data,
      tenant_id,
      user,
      loginSession,
      {
        client: params.client,
        authParams: params.authParams,
      },
    );

    await ctx.env.hooks.onExecutePostLogin(eventObject, {
      prompt: {
        render: (_formId: string) => {},
      },
      redirect: {
        sendUserTo: (
          url: string,
          options?: { query?: Record<string, string> },
        ) => {
          // Add state parameter automatically for AuthHero compatibility
          const urlObj = new URL(url, ctx.req.url);
          urlObj.searchParams.set("state", loginSession.id);

          // Add any additional query parameters
          if (options?.query) {
            Object.entries(options.query).forEach(([key, value]) => {
              urlObj.searchParams.set(key, value);
            });
          }

          redirectUrl = urlObj.toString();
        },
        encodeToken: (options: {
          secret: string;
          payload: Record<string, any>;
          expiresInSeconds?: number;
        }) => {
          // Implement JWT token encoding here
          // For now, return a placeholder - you'd implement proper JWT signing
          return JSON.stringify({
            payload: options.payload,
            exp: Date.now() + (options.expiresInSeconds || 900) * 1000,
          });
        },
        validateToken: (_options: {
          secret: string;
          tokenParameterName?: string;
        }) => {
          // Implement JWT token validation here
          // For now, return null - you'd implement proper JWT verification
          return null;
        },
      },
      token: createTokenAPI(ctx, tenant_id),
    });

    // If a redirect was requested, mark session as awaiting hook and return redirect
    if (redirectUrl) {
      await startLoginSessionHook(
        ctx,
        tenant_id,
        loginSession,
        "onExecutePostLogin",
      );
      return new Response(null, {
        status: 302,
        headers: { location: redirectUrl },
      });
    }
  }

  const { hooks } = await data.hooks.list(tenant_id);
  const postLoginHooks = hooks.filter(
    (h: any) => h.trigger_id === "post-user-login",
  );

  // Handle form hook (redirect) if we have a login session
  if (loginSession) {
    const formHook = postLoginHooks.find(
      (h: any) => h.enabled && isFormHook(h),
    );
    if (formHook && isFormHook(formHook)) {
      return handleFormHook(
        ctx,
        formHook.form_id,
        loginSession,
        user,
        params?.client,
      );
    }

    // Handle page hook (redirect) if we have a login session
    const pageHook = postLoginHooks.find(
      (h: any) => h.enabled && isPageHook(h),
    );
    if (pageHook && isPageHook(pageHook)) {
      return handlePageHook(
        ctx,
        pageHook.page_id,
        loginSession,
        user,
        pageHook.permission_required,
      );
    }
  }

  // Handle template hooks (execute pre-defined hook functions)
  const templateHooks = postLoginHooks.filter(
    (h: any) => h.enabled && isTemplateHook(h),
  );
  for (const hook of templateHooks) {
    if (!isTemplateHook(hook)) continue;
    try {
      user = await handleTemplateHook(ctx, hook.template_id, user);
    } catch (err) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: `Failed to execute template hook: ${hook.template_id}`,
      });
    }
  }

  // Handle code hooks (execute user-authored code)
  const codeHooks = postLoginHooks.filter(
    (h: any) => h.enabled && isCodeHook(h),
  );
  for (const hook of codeHooks) {
    if (!isCodeHook(hook)) continue;
    try {
      await handleCodeHook(
        ctx,
        data,
        hook,
        {
          ctx,
          user,
          request: {
            ip: ctx.var.ip || "",
            user_agent: ctx.var.useragent || "",
            method: ctx.req.method,
            url: ctx.req.url,
          },
          tenant: { id: tenant_id },
        } as any,
        "post-user-login",
        {},
      );
    } catch (err) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: `Failed to execute code hook: ${hook.hook_id}`,
      });
    }
  }

  // Handle webhook hooks (invoke all enabled webhooks)
  const webHooks = postLoginHooks.filter((h: any) => h.enabled && isWebHook(h));
  await invokeHooks(ctx, webHooks, {
    tenant_id,
    user,
    trigger_id: "post-user-login",
  });

  // If no form hook, just return the user
  return user;
}
