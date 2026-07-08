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
import {
  isCodeHook,
  handleCodeHook,
  persistActionExecution,
  HandleCodeHookOutcome,
} from "./codehooks";
import { invokeHooks } from "./webhooks";
import { createTokenAPI } from "./helpers/token-api";
import {
  getConnectionInfo,
  resolveConnectionName,
} from "../helpers/connection";
import { waitUntil } from "../helpers/wait-until";

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
  params: {
    client: EnrichedClient;
    authParams?: any;
    authStrategy?: { strategy: string; strategy_type: string };
    /** The resolved connection name actually used to authenticate. */
    connection?: string;
  },
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

  // The connection actually used to authenticate is resolved once in
  // `postUserLoginHook` (session sources first, the primary identity's
  // `user.connection` only as a last resort) and passed in here, so the hook
  // event and the success log can never drift apart.
  const connectionName = params.connection;

  // Get connection information
  const connectionInfo = await getConnectionInfo(
    ctx,
    tenant_id,
    connectionName,
    user,
  );

  // Get organization information if available
  let organizationInfo:
    | {
        id: string;
        name: string;
        display_name: string;
        metadata: Record<string, unknown>;
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
  const countryCode = ctx.var?.countryCode;
  const ip = ctx.var?.ip;
  const userAgent = ctx.var?.useragent;

  return {
    // AuthHero specific
    ctx,

    // Auth0 compatible properties
    client: params.client,
    user: stripInternalUserFields(user),
    request: {
      asn: undefined, // ASN not available in current context variables
      ip: ip || "",
      user_agent: userAgent,
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
    connection: connectionInfo ?? {
      id: connectionName || Strategy.USERNAME_PASSWORD,
      name: connectionName || Strategy.USERNAME_PASSWORD,
      strategy: params.authStrategy?.strategy || user.provider || "auth0",
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
        initial_ip: ip,
        initial_user_agent: userAgent,
        last_ip: user.last_ip || ip,
        last_user_agent: userAgent,
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
    /** The connection name actually used to authenticate. */
    authConnection?: string;
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
  // The log's `connection` is the connection NAME actually used (e.g.
  // "Okta-Warner"), never the strategy (e.g. "okta") — those only coincide for
  // database/passwordless connections. Session sources win (correct even for
  // linked users / SSO reuse); the primary identity's `user.connection` is the
  // last resort — that fallback is what caused SSO re-issues to mislabel
  // linked-identity logins.
  const connection =
    resolveConnectionName({
      loginSession,
      authConnection: params?.authConnection,
      ctxConnection: ctx.var.connection,
      user,
    }) || "";

  // SUCCESS_LOGIN is emitted in the `finally` below — deferred so we can embed
  // `details.execution_id` when post-login actions ran (matches Auth0's model
  // of reaching executions via tenant logs). The try/finally guarantees the
  // log still fires for early returns (form/page/env-hook redirects) and even
  // if a hook throws, preserving the prior unconditional-emission behavior.
  let executionId: string | null = null;
  try {
    // Update the user's last login info. Deferred off the critical path:
    // nothing in this request reads the result (the in-memory `user` keeps
    // the pre-login values either way), and the row write plus its
    // user-update decorator chain is one of the slowest calls in the login
    // flow.
    const lastLogin = new Date().toISOString();
    const lastIp = ctx.var.ip || "";
    const loginCount = user.login_count + 1;
    // Contract phase of issue #1003: user_activity is the authoritative
    // store for these counters. The users.update fallback only exists for
    // third-party adapters without a userActivity implementation (all
    // in-repo adapters ship one), which keep the legacy columns on users.
    if (data.userActivity) {
      waitUntil(
        ctx,
        data.userActivity.upsert(tenant_id, user.user_id, {
          last_login: lastLogin,
          last_ip: lastIp,
          login_count: loginCount,
        }),
      );
    } else {
      waitUntil(
        ctx,
        data.users.update(tenant_id, user.user_id, {
          last_login: lastLogin,
          last_ip: lastIp,
          login_count: loginCount,
        }),
      );
    }

    // Build the Auth0-compatible event once. Reused by both the env-hook
    // (ctx.env.hooks.onExecutePostLogin) and the code-hook loop below so user
    // actions see the same `event.client`, `event.connection`, `event.transaction`
    // etc. that Auth0 exposes.
    const enhancedEvent =
      params?.client && params?.authParams && loginSession
        ? await buildEnhancedEventObject(
            ctx,
            data,
            tenant_id,
            user,
            loginSession,
            {
              client: params.client,
              authParams: params.authParams,
              authStrategy: params.authStrategy,
              connection,
            },
          )
        : null;

    // Trigger any onExecutePostLogin hooks defined in ctx.env.hooks
    if (ctx.env.hooks?.onExecutePostLogin && enhancedEvent && loginSession) {
      let redirectUrl: string | null = null;

      await ctx.env.hooks.onExecutePostLogin(enhancedEvent, {
        prompt: {
          render: (_formId: string) => {},
        },
        redirect: {
          sendUserTo: (
            url: string,
            options?: { query?: Record<string, string> },
          ) => {
            const urlObj = new URL(url, ctx.req.url);

            // Add any additional query parameters first, then set the state
            // parameter last so a user-supplied `query.state` can't overwrite
            // the login-session state AuthHero relies on for compatibility.
            if (options?.query) {
              Object.entries(options.query).forEach(([key, value]) => {
                urlObj.searchParams.set(key, value);
              });
            }
            urlObj.searchParams.set("state", loginSession.id);

            redirectUrl = urlObj.toString();
          },
          encodeToken: (_options: {
            secret: string;
            payload: Record<string, any>;
            expiresInSeconds?: number;
          }): string => {
            // Fail loudly instead of returning placeholder output that action
            // code would mistake for a real signed token.
            throw new Error("redirect.encodeToken is not implemented");
          },
          validateToken: (_options: {
            secret: string;
            tokenParameterName?: string;
          }): Record<string, any> => {
            throw new Error("redirect.validateToken is not implemented");
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
        user = await handleTemplateHook(
          ctx,
          hook.template_id,
          user,
          hook.metadata,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to execute template hook ${hook.template_id}: ${message}`,
          details: {
            template_id: hook.template_id,
            trigger_id: "post-user-login",
            error: message,
          },
        });
      }
    }

    // Handle code hooks (execute user-authored code). Code hooks need the full
    // Auth0-compatible event (client, transaction, connection, session, …).
    // If the prerequisites aren't available we skip — same behaviour as
    // ctx.env.hooks.onExecutePostLogin above, and matches Auth0 which won't
    // fire post-login actions without a client and session context.
    const codeHooks = postLoginHooks.filter(
      (h: any) => h.enabled && isCodeHook(h),
    );
    if (enhancedEvent && codeHooks.length > 0) {
      const outcomes: HandleCodeHookOutcome[] = [];
      for (const hook of codeHooks) {
        if (!isCodeHook(hook)) continue;
        try {
          const outcome = await handleCodeHook(
            ctx,
            data,
            hook,
            enhancedEvent,
            "post-user-login",
            {},
          );
          if (outcome) outcomes.push(outcome);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outcomes.push({
            result: {
              action_name: hook.code_id,
              error: { id: "execution_threw", msg: message },
              started_at: new Date().toISOString(),
              ended_at: new Date().toISOString(),
            },
            logs: [],
            denied: false,
          });
        }
      }
      const persistedExecutionId = await persistActionExecution(
        data,
        tenant_id,
        "post-user-login",
        outcomes,
      );
      if (persistedExecutionId) {
        executionId = persistedExecutionId;
        ctx.set("action_execution_id", persistedExecutionId);
      }
    }

    // Handle webhook hooks (invoke all enabled webhooks)
    const webHooks = postLoginHooks.filter(
      (h: any) => h.enabled && isWebHook(h),
    );
    await invokeHooks(ctx, webHooks, {
      tenant_id,
      user,
      trigger_id: "post-user-login",
    });

    // If no form hook, just return the user
    return user;
  } finally {
    logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_LOGIN,
      description: `Successful login for ${user.user_id}`,
      userId: user.user_id,
      username: user.email || user.phone_number || user.name,
      client_name: params?.client?.name,
      strategy_type,
      strategy,
      connection,
      audience: params?.authParams?.audience,
      scope: params?.authParams?.scope,
      ...(executionId ? { details: { execution_id: executionId } } : {}),
    });
  }
}
