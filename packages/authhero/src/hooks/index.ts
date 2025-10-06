import {
  LegacyClient,
  DataAdapters,
  LogTypes,
  User,
  LoginSession,
} from "@authhero/adapter-interfaces";
import { linkUsersHook } from "./link-users";
import { postUserRegistrationWebhook, preUserSignupWebhook } from "./webhooks";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getPrimaryUserByEmail } from "../helpers/users";
import { createLogMessage } from "../utils/create-log-message";
import { HTTPException } from "hono/http-exception";
import { HookRequest } from "../types/Hooks";
import { isFormHook, handleFormHook } from "./formhooks";
import { isPageHook, handlePageHook } from "./pagehooks";

// Type guard for webhook hooks
function isWebHook(hook: any): hook is { url: string; enabled: boolean } {
  return typeof hook.url === "string";
}

function createUserHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user: User) => {
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.req.query("x-real-ip") || "",
      user_agent: ctx.req.query("user-agent"),
      url: ctx.var.loginSession?.authorization_url || ctx.req.url,
    };

    if (ctx.env.hooks?.onExecutePreUserRegistration) {
      try {
        await ctx.env.hooks.onExecutePreUserRegistration(
          {
            ctx,
            user,
            request,
          },
          {
            user: {
              setUserMetadata: async (key, value) => {
                user[key] = value;
              },
            },
          },
        );
      } catch (err) {
        const log = createLogMessage(ctx, {
          type: LogTypes.FAILED_SIGNUP,
          description: "Pre user registration hook failed",
        });
        await data.logs.create(tenant_id, log);
      }
    }

    // Check for existing user with the same email and if so link the users
    let result = await linkUsersHook(data)(tenant_id, user);

    if (ctx.env.hooks?.onExecutePostUserRegistration) {
      try {
        await ctx.env.hooks.onExecutePostUserRegistration(
          {
            ctx,
            user,
            request,
          },
          {
            user: {},
          },
        );
      } catch (err) {
        const log = createLogMessage(ctx, {
          type: LogTypes.FAILED_SIGNUP,
          description: "Post user registration hook failed",
        });
        await ctx.env.data.logs.create(tenant_id, log);
      }
    }

    // Invoke post-user-registration webhooks
    await postUserRegistrationWebhook(ctx)(tenant_id, result);

    return result;
  };
}

function createUserUpdateHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user_id: string, updates: Partial<User>) => {
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.req.query("x-real-ip") || "",
      user_agent: ctx.req.query("user-agent"),
      url: ctx.var.loginSession?.authorization_url || ctx.req.url,
    };

    if (ctx.env.hooks?.onExecutePreUserUpdate) {
      try {
        // The hook throws to cancel the update
        await ctx.env.hooks.onExecutePreUserUpdate(
          {
            ctx,
            user_id,
            updates,
            request,
          },
          {
            user: {
              setUserMetadata: async (key, value) => {
                updates[key] = value;
              },
            },
            cancel: () => {
              throw new HTTPException(400, {
                message: "User update cancelled by pre-update hook",
              });
            },
          },
        );
      } catch (err) {
        // If it's already an HTTPException, re-throw it
        if (err instanceof HTTPException) {
          throw err;
        }

        const log = createLogMessage(ctx, {
          type: LogTypes.FAILED_HOOK,
          description: "Pre user update hook failed",
        });
        await data.logs.create(tenant_id, log);

        throw new HTTPException(400, {
          message: "Pre user update hook failed",
        });
      }
    }

    // If we get here, proceed with the update
    await data.users.update(tenant_id, user_id, updates);

    if (updates.email) {
      const log = createLogMessage(ctx, {
        type: LogTypes.SUCCESS_CHANGE_EMAIL,
        description: `Email updated to ${updates.email}`,
        userId: user_id,
      });
      await data.logs.create(tenant_id, log);

      console.log("log:", log);
    }

    return true;
  };
}

export async function preUserSignupHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: LegacyClient,
  data: DataAdapters,
  email: string,
) {
  // Check the disabled flag on the client
  if (client.client_metadata?.disable_sign_ups === "true") {
    const authorizeUrl = ctx.var.loginSession?.authorization_url;

    // Check if screen_hint=signup was specified in the authorization URL
    const isExplicitSignup =
      authorizeUrl &&
      new URL(authorizeUrl).searchParams.get("screen_hint") === "signup";

    // If screen_hint=signup was specified, allow the signup regardless of the disable_sign_ups setting
    if (!isExplicitSignup) {
      // If there is another user with the same email, allow the signup as they will be linked together
      const existingUser = await getPrimaryUserByEmail({
        userAdapter: data.users,
        tenant_id: client.tenant.id,
        email,
      });

      if (!existingUser) {
        const log = createLogMessage(ctx, {
          type: LogTypes.FAILED_SIGNUP,
          description: "Public signup is disabled",
        });
        await data.logs.create(client.tenant.id, log);

        throw new HTTPException(400, {
          message: "Signups are disabled for this client",
        });
      }
    }
  }

  await preUserSignupWebhook(ctx)(ctx.var.tenant_id || "", email);
}

function createUserDeletionHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user_id: string) => {
    // Get user details before deletion for logging
    const userToDelete = await data.users.get(tenant_id, user_id);

    // If user doesn't exist, return false immediately
    if (!userToDelete) {
      return false;
    }

    // Proceed with deletion
    const result = await data.users.remove(tenant_id, user_id);

    // Log the user deletion if successful
    if (result) {
      const log = createLogMessage(ctx, {
        type: LogTypes.SUCCESS_USER_DELETION,
        description: `user_id: ${user_id}`,
        strategy: userToDelete.provider || "auth0",
        strategy_type: userToDelete.is_social ? "social" : "database",
      });

      // Add connection details
      log.connection = userToDelete.connection || "";
      log.connection_id = ""; // Connection ID not available in current context

      // Add tenant info to details
      log.details = {
        ...log.details,
        body: {
          tenant: tenant_id,
          connection: userToDelete.connection || "",
        },
      };

      await data.logs.create(tenant_id, log);
    }

    return result;
  };
}

export function addDataHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): DataAdapters {
  return {
    ...data,
    users: {
      ...data.users,
      create: createUserHooks(ctx, data),
      update: createUserUpdateHooks(ctx, data),
      remove: createUserDeletionHooks(ctx, data),
    },
  };
}

/**
 * postUserLoginHook: Checks for post-user-login hooks (form or webhook) and handles:
 * - Form hooks: redirects to the first node in the form
 * - Webhook hooks: invokes the webhook and logs errors if any
 * If neither, returns the user as normal.
 */
/**
 * Builds an enhanced event object with Auth0-compatible properties
 */
async function buildEnhancedEventObject(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  tenant_id: string,
  user: User,
  loginSession: LoginSession,
  params: { client: LegacyClient; authParams?: any },
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
    user,
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
            id: user.connection || "Username-Password-Authentication",
            name: user.connection || "Username-Password-Authentication",
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

export async function postUserLoginHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  tenant_id: string,
  user: User,
  loginSession?: LoginSession,
  params?: {
    client?: LegacyClient;
    authParams?: any;
    authStrategy?: { strategy: string; strategy_type: string };
  },
): Promise<User | Response> {
  // Determine strategy_type based on explicit auth strategy or user's is_social flag
  // Use authStrategy if provided (actual authentication method), otherwise infer from user
  const strategy_type = params?.authStrategy?.strategy_type
    ? params.authStrategy.strategy_type
    : user.is_social
      ? "social"
      : "database";
  const strategy = params?.authStrategy?.strategy || user.connection || "";

  // Log successful login
  const logMessage = createLogMessage(ctx, {
    type: LogTypes.SUCCESS_LOGIN,
    description: `Successful login for ${user.user_id}`,
    userId: user.user_id,
    strategy_type,
    strategy,
    connection: strategy, // Use the same value for both strategy and connection
  });

  await data.logs.create(tenant_id, logMessage);

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
    });

    // If a redirect was requested, return it immediately
    if (redirectUrl) {
      return new Response(null, {
        status: 302,
        headers: { location: redirectUrl },
      });
    }
  }

  const { hooks } = await data.hooks.list(tenant_id, {
    q: "trigger_id:post-user-login",
    page: 0,
    per_page: 100,
    include_totals: false,
  });

  // Handle form hook (redirect) if we have a login session
  if (loginSession) {
    const formHook = hooks.find((h: any) => h.enabled && isFormHook(h));
    if (formHook && isFormHook(formHook)) {
      return handleFormHook(ctx, formHook.form_id, loginSession);
    }

    // Handle page hook (redirect) if we have a login session
    const pageHook = hooks.find((h: any) => h.enabled && isPageHook(h));
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

  // Handle webhook hooks (invoke all enabled webhooks)
  const webHooks = hooks.filter((h: any) => h.enabled && isWebHook(h));
  for (const hook of webHooks) {
    if (!isWebHook(hook)) continue;
    try {
      await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id,
          user,
          trigger_id: "post-user-login",
        }),
      });
    } catch (err) {
      const log = createLogMessage(ctx, {
        type: LogTypes.FAILED_HOOK,
        description: `Failed to invoke post-user-login webhook: ${hook.url}`,
      });
      await data.logs.create(tenant_id, log);
    }
  }

  // If no form hook, just return the user
  return user;
}
