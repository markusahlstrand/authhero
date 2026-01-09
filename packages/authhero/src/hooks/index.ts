import {
  LegacyClient,
  DataAdapters,
  UserDataAdapter,
  LogTypes,
  User,
  LoginSession,
} from "@authhero/adapter-interfaces";
import { linkUsersHook } from "./link-users";
import {
  postUserRegistrationWebhook,
  preUserRegistrationWebhook,
  getValidateRegistrationUsernameWebhook,
  preUserDeletionWebhook,
  postUserDeletionWebhook,
} from "./webhooks";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getPrimaryUserByEmail } from "../helpers/users";
import { logMessage } from "../helpers/logging";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { HookRequest } from "../types/Hooks";
import { isFormHook, handleFormHook, getRedirectUrl } from "./formhooks";
import { isPageHook, handlePageHook } from "./pagehooks";
import { createServiceToken } from "../helpers/service-token";

// Helper function to create token API
function createTokenAPI(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
) {
  return {
    createServiceToken: async (params: {
      scope: string;
      expiresInSeconds?: number;
    }) => {
      const tokenResponse = await createServiceToken(
        ctx,
        tenant_id,
        params.scope,
        params.expiresInSeconds,
      );
      return tokenResponse.access_token;
    },
  };
}

// Type guard for webhook hooks
function isWebHook(hook: any): hook is { url: string; enabled: boolean } {
  return typeof hook.url === "string";
}

function createUserHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user: User) => {
    // Get the client_id from context if available (auth flows)
    // Management API calls won't have client_id, so skip validation in that case
    if (ctx.var.client_id) {
      const client = await data.legacyClients.get(ctx.var.client_id);

      if (!client) {
        throw new JSONHTTPException(400, {
          message: "Client not found",
        });
      }

      // Call preUserSignupHook BEFORE any user creation logic
      // This ensures ALL signup methods (email, code, social) are checked
      // Only validate email-based signups (skip SMS/phone-based signups)
      if (user.email) {
        await preUserSignupHook(ctx, client, data, user.email);
      }
    }

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
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_SIGNUP,
          description: "Pre user registration hook failed",
        });
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
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_SIGNUP,
          description: "Post user registration hook failed",
        });
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
): UserDataAdapter["update"] {
  return async (tenant_id, user_id, updates) => {
    // If we're only updating linked_to, skip all hooks to avoid recursion
    if (Object.keys(updates).length === 1 && "linked_to" in updates) {
      return data.users.update(tenant_id, user_id, updates);
    }

    // Fetch the user before it's updated
    const user = await data.users.get(tenant_id, user_id);

    if (!user) {
      throw new JSONHTTPException(404, {
        message: "User not found",
      });
    }

    // Build request object once for reuse
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.var.ip || ctx.get("ip") || "",
      user_agent: ctx.var.useragent || ctx.get("useragent") || "",
      url: ctx.req.url,
    };

    // Call pre-user-update hooks if configured
    if (ctx.env.hooks?.onExecutePreUserUpdate) {
      try {
        await ctx.env.hooks.onExecutePreUserUpdate(
          {
            ctx,
            tenant: { id: tenant_id },
            user_id,
            user,
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
              throw new JSONHTTPException(400, {
                message: "User update cancelled by pre-update hook",
              });
            },
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        throw new JSONHTTPException(400, {
          message: "Pre user update hook failed",
        });
      }
    }

    // If we get here, proceed with the update
    await data.users.update(tenant_id, user_id, updates);

    // Check if email was updated or verified - if so, check for account linking
    if (updates.email || updates.email_verified) {
      const updatedUser = await data.users.get(tenant_id, user_id);
      if (updatedUser && updatedUser.email && updatedUser.email_verified) {
        // Get all users with the same verified email
        const { users: matchingUsers } = await data.users.list(tenant_id, {
          page: 0,
          per_page: 10,
          include_totals: false,
          q: `email:${updatedUser.email}`,
        });

        // Filter to verified users and exclude the current user
        const verifiedUsers = matchingUsers.filter(
          (u) => u.email_verified && u.user_id !== user_id && !u.linked_to,
        );

        // If there's another verified user with the same email, link to them
        if (verifiedUsers.length > 0) {
          await data.users.update(tenant_id, user_id, {
            linked_to: verifiedUsers[0]!.user_id,
          });
        }
      }
    }

    if (updates.email) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.SUCCESS_CHANGE_EMAIL,
        description: `Email updated to ${updates.email}`,
        userId: user_id,
      });
    }

    return true;
  };
}

/**
 * Validates if an email can be used for signup based on client settings.
 * This is a lightweight check that can be done early (e.g., on identifier page)
 * without committing to creating a user.
 *
 * Supports code-based hooks via onExecuteValidateRegistrationUsername
 *
 * @returns An object with `allowed` boolean and optional `reason` string
 */
export async function validateSignupEmail(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: LegacyClient,
  data: DataAdapters,
  email: string,
  connection: string = "email",
): Promise<{ allowed: boolean; reason?: string }> {
  // Check the disabled flag on the client
  if (client.client_metadata?.disable_sign_ups === "true") {
    const authorizeUrl = ctx.var.loginSession?.authorization_url;

    // Check if screen_hint=signup was specified in the authorization URL
    const isExplicitSignup =
      authorizeUrl &&
      new URL(authorizeUrl).searchParams.get("screen_hint") === "signup";

    // If screen_hint=signup was specified, allow the signup
    if (isExplicitSignup) {
      return { allowed: true };
    }

    // If there is another user with the same email, allow as they will be linked
    const existingUser = await getPrimaryUserByEmail({
      userAdapter: data.users,
      tenant_id: client.tenant.id,
      email,
    });

    if (!existingUser) {
      return {
        allowed: false,
        reason: "Public signup is disabled for this client",
      };
    }
  }

  // Call code-based hook if configured
  if (ctx.env.hooks?.onExecuteValidateRegistrationUsername) {
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.var.ip || ctx.get("ip") || "",
      user_agent: ctx.var.useragent || ctx.get("useragent") || "",
      url: ctx.req.url,
    };

    let denied = false;
    let denyReason: string | undefined;

    try {
      await ctx.env.hooks.onExecuteValidateRegistrationUsername(
        {
          ctx,
          client,
          request,
          tenant: { id: client.tenant.id },
          user: { email, connection },
        },
        {
          deny: (reason?: string) => {
            denied = true;
            denyReason = reason;
          },
          token: createTokenAPI(ctx, client.tenant.id),
        },
      );

      if (denied) {
        return { allowed: false, reason: denyReason };
      }
    } catch (err) {
      // If hook throws, treat as denial
      return {
        allowed: false,
        reason: "Signup validation hook failed",
      };
    }
  }

  // Call webhook if configured
  const validateSignupEmailWebhook =
    await getValidateRegistrationUsernameWebhook(ctx, client.tenant.id);
  if (validateSignupEmailWebhook && "url" in validateSignupEmailWebhook) {
    try {
      // Create service token for webhook authentication
      const token = await createServiceToken(ctx, client.tenant.id, "webhook");

      const response = await fetch(validateSignupEmailWebhook.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: client.tenant.id,
          email,
          connection,
          client_id: client.client_id,
          trigger_id: "validate-registration-username",
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          allowed: false,
          reason: body || "Signup not allowed by webhook",
        };
      }

      // Check if webhook returned a denial
      const webhookResult = await response.json();
      if (webhookResult.allowed === false) {
        return {
          allowed: false,
          reason: webhookResult.reason || "Signup not allowed by webhook",
        };
      }
    } catch (err) {
      // Log webhook error but don't block signup
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_HOOK,
        description: "Validate signup email webhook failed",
      });
    }
  }

  return { allowed: true };
}

/**
 * Pre-user signup hook that runs RIGHT BEFORE user creation.
 * This runs for ALL signup methods (email/password, code, social, etc.)
 * and enforces signup policies and invokes webhooks.
 *
 * This hook is called from createUserHooks and will throw an HTTPException
 * if the signup should be blocked.
 */
export async function preUserSignupHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: LegacyClient,
  data: DataAdapters,
  email: string,
) {
  // Re-validate signup eligibility at creation time
  const validation = await validateSignupEmail(ctx, client, data, email);

  if (!validation.allowed) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_SIGNUP,
      description: validation.reason || "Signup not allowed",
    });

    throw new JSONHTTPException(400, {
      message: validation.reason || "Signups are disabled for this client",
    });
  }

  // Invoke pre-registration webhooks
  await preUserRegistrationWebhook(ctx)(client.tenant.id, email);
}

function createUserDeletionHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user_id: string) => {
    // Get user details before deletion for logging and hooks
    const userToDelete = await data.users.get(tenant_id, user_id);

    // If user doesn't exist, return false immediately
    if (!userToDelete) {
      return false;
    }

    // Build request object for hooks
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.var.ip || ctx.get("ip") || "",
      user_agent: ctx.var.useragent || ctx.get("useragent") || "",
      url: ctx.req.url,
    };

    // Call pre-user-deletion hook if configured
    if (ctx.env.hooks?.onExecutePreUserDeletion) {
      try {
        await ctx.env.hooks.onExecutePreUserDeletion(
          {
            ctx,
            user: userToDelete,
            user_id,
            request,
            tenant: {
              id: tenant_id,
            },
          },
          {
            cancel: () => {
              throw new JSONHTTPException(400, {
                message: "User deletion cancelled by pre-deletion hook",
              });
            },
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        if (err instanceof HTTPException) {
          throw err;
        }
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Pre user deletion hook failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw new JSONHTTPException(400, {
          message: "Pre user deletion hook failed",
        });
      }
    }

    // Invoke pre-user-deletion webhooks
    try {
      await preUserDeletionWebhook(ctx)(tenant_id, userToDelete);
    } catch (err) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: `Pre user deletion webhook failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw new JSONHTTPException(400, {
        message: "Pre user deletion webhook failed",
      });
    }

    // Proceed with deletion
    const result = await data.users.remove(tenant_id, user_id);

    // Log the user deletion if successful
    if (result) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.SUCCESS_USER_DELETION,
        description: `user_id: ${user_id}`,
        strategy: userToDelete.provider || "auth0",
        strategy_type: userToDelete.is_social ? "social" : "database",
        connection: userToDelete.connection || "",
        body: {
          tenant: tenant_id,
          connection: userToDelete.connection || "",
        },
      });

      // Invoke post-user-deletion webhooks
      try {
        await postUserDeletionWebhook(ctx)(tenant_id, userToDelete);
      } catch (err) {
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Post user deletion webhook failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        // Don't throw - user is already deleted
      }
    }

    // Call post-user-deletion hook if configured (after successful deletion)
    if (result && ctx.env.hooks?.onExecutePostUserDeletion) {
      try {
        await ctx.env.hooks.onExecutePostUserDeletion(
          {
            ctx,
            user: userToDelete,
            user_id,
            request,
            tenant: {
              id: tenant_id,
            },
          },
          {
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Post user deletion hook failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        // Don't throw - user is already deleted
      }
    }

    return result;
  };
}

export function addDataHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): DataAdapters {
  // Store reference to raw data adapter so hooks can bypass themselves
  const rawData = data;

  return {
    ...data,
    users: {
      ...data.users,
      create: createUserHooks(ctx, rawData),
      update: createUserUpdateHooks(ctx, rawData),
      remove: createUserDeletionHooks(ctx, rawData),
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
  // If pipeline is already suspended (user is returning from a hook),
  // skip running hooks - the continue handler will be called separately.
  // We check for explicit presence of current (not null) to distinguish from
  // a fresh login session where pipeline_state may be undefined or have current: null.
  if (
    loginSession?.pipeline_state?.current !== undefined &&
    loginSession?.pipeline_state?.current !== null
  ) {
    return user;
  }

  // Determine strategy_type based on explicit auth strategy or user's is_social flag
  // Use authStrategy if provided (actual authentication method), otherwise infer from user
  const strategy_type = params?.authStrategy?.strategy_type
    ? params.authStrategy.strategy_type
    : user.is_social
      ? "social"
      : "database";
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

  // Get current pipeline position (0 if not set)
  const pipelinePosition = loginSession?.pipeline_state?.position ?? 0;

  // Trigger any onExecutePostLogin hooks defined in ctx.env.hooks
  // Only run if we're at position 0 (first hook in pipeline)
  if (
    pipelinePosition === 0 &&
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

    let accessDenied = false;
    let denyCode = "";
    let denyReason = "";

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
      authentication: {
        recordMethod: (_url: string) => {
          // Recording methods is only available in onContinuePostLogin
          // This is a no-op in onExecutePostLogin (matches Auth0 behavior)
        },
      },
      access: {
        deny: (code: string, reason?: string) => {
          accessDenied = true;
          denyCode = code;
          denyReason = reason || "";
        },
      },
      token: createTokenAPI(ctx, tenant_id),
    });

    // If access was denied, return error response
    if (accessDenied) {
      if (!loginSession.authParams.redirect_uri) {
        throw new HTTPException(403, {
          message: denyReason || "Access denied",
        });
      }

      const errorRedirectUrl = new URL(loginSession.authParams.redirect_uri);
      errorRedirectUrl.searchParams.set("error", "access_denied");
      errorRedirectUrl.searchParams.set(
        "error_description",
        denyReason || denyCode || "Access denied by hook",
      );
      if (loginSession.authParams.state) {
        errorRedirectUrl.searchParams.set("state", loginSession.authParams.state);
      }

      return new Response(null, {
        status: 302,
        headers: { location: errorRedirectUrl.toString() },
      });
    }

    // If a redirect was requested, suspend the pipeline and store hook state
    if (redirectUrl) {
      // Suspend pipeline with action hook state
      await data.loginSessions.update(tenant_id, loginSession.id, {
        pipeline_state: {
          position: 0,
          current: {
            type: "action",
            id: "onExecutePostLogin",
          },
          context: loginSession.pipeline_state?.context ?? {},
        },
      });
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
      const formHookResult = await handleFormHook(ctx, formHook.form_id, loginSession, user);
      // If handleFormHook returns a result, handle it based on type
      // If it returns null, the flow ended without requiring any action - continue with normal auth flow
      if (formHookResult) {
        if (formHookResult.type === "step") {
          // Show form step node - suspend pipeline
          await data.loginSessions.update(tenant_id, loginSession.id, {
            pipeline_state: {
              position: 1,
              current: {
                type: "form",
                id: formHookResult.formId,
                step: formHookResult.nodeId,
              },
              context: loginSession.pipeline_state?.context ?? {},
            },
          });
          const url = `/u/forms/${formHookResult.formId}/nodes/${formHookResult.nodeId}?state=${encodeURIComponent(loginSession.id)}`;
          return new Response(null, {
            status: 302,
            headers: { location: url },
          });
        } else if (formHookResult.type === "redirect") {
          // Redirect to change-email, account, or custom URL - suspend pipeline with form context
          await data.loginSessions.update(tenant_id, loginSession.id, {
            pipeline_state: {
              position: 1,
              current: {
                type: "form",
                id: formHookResult.formId,
                step: formHookResult.nextNode, // Where to continue after redirect completes
                return_to: formHookResult.target,
              },
              context: loginSession.pipeline_state?.context ?? {},
            },
          });
          const redirectUrl = getRedirectUrl(
            formHookResult.target as "change-email" | "account" | "custom",
            formHookResult.customUrl,
            loginSession.id,
          );
          return new Response(null, {
            status: 302,
            headers: { location: redirectUrl },
          });
        }
      }
    }

    // Handle page hook (redirect) if we have a login session
    const pageHook = hooks.find((h: any) => h.enabled && isPageHook(h));
    if (pageHook && isPageHook(pageHook)) {
      // Suspend pipeline with page hook state
      await data.loginSessions.update(tenant_id, loginSession.id, {
        pipeline_state: {
          position: 2, // Page hooks are after form hooks
          current: {
            type: "page",
            id: pageHook.page_id,
          },
          context: loginSession.pipeline_state?.context ?? {},
        },
      });
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
      logMessage(ctx, tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: `Failed to invoke post-user-login webhook: ${hook.url}`,
      });
    }
  }

  // If no form hook, just return the user
  return user;
}

/**
 * Auth0-style continue handler - called when user returns from a redirect action.
 * This resumes the suspended pipeline by calling onContinuePostLogin.
 *
 * @param ctx - Hono context
 * @param data - Data adapters
 * @param tenant_id - Tenant ID
 * @param user - The authenticated user
 * @param loginSession - The login session (must have pipeline_state.current set)
 * @param params - Additional parameters including client and authParams
 * @returns Updated user or Response (if redirect to form node or access denied)
 */
export async function continuePostLogin(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  tenant_id: string,
  user: User,
  loginSession: LoginSession,
  params?: {
    client?: LegacyClient;
    authParams?: any;
  },
): Promise<User | Response> {
  const pipelineState = loginSession.pipeline_state;

  // Only proceed if the pipeline was suspended
  if (!pipelineState?.current) {
    return user;
  }

  const { type, id, step } = pipelineState.current;

  // Handle form redirects - check if we need to continue to a form node
  if (type === "form") {
    // If there's a step to continue to and it's not the ending
    if (step && step !== "$ending") {
      // Clear the current suspension and advance position
      await data.loginSessions.update(tenant_id, loginSession.id, {
        pipeline_state: {
          position: pipelineState.position,
          current: null,
          context: pipelineState.context,
        },
      });

      const url = `/u/forms/${id}/nodes/${step}?state=${encodeURIComponent(loginSession.id)}`;
      return new Response(null, {
        status: 302,
        headers: { location: url },
      });
    }
    // If step is $ending or missing, fall through to advance the pipeline
  }

  // Handle onContinuePostLogin for code-based action hooks
  if (
    type === "action" &&
    id === "onExecutePostLogin" &&
    ctx.env.hooks?.onContinuePostLogin &&
    params?.client &&
    params?.authParams
  ) {
    let accessDenied = false;
    let denyCode = "";
    let denyReason = "";
    const customAccessTokenClaims: Record<string, unknown> = {};
    const customIdTokenClaims: Record<string, unknown> = {};
    const authenticationMethods: Array<{ name: string; timestamp: string }> = [];

    // Build enhanced event object
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

    await ctx.env.hooks.onContinuePostLogin(eventObject, {
      redirect: {
        validateToken: (options: {
          secret: string;
          tokenParameterName?: string;
        }) => {
          // Get the token from query params
          const tokenParamName = options.tokenParameterName || "session_token";
          const url = new URL(ctx.req.url);
          const token = url.searchParams.get(tokenParamName);

          if (!token) {
            return null;
          }

          try {
            // Parse and validate the token
            // In production, this should verify JWT signature with the secret
            const parsed = JSON.parse(token);
            if (parsed.exp && parsed.exp < Date.now()) {
              return null; // Token expired
            }
            return parsed.payload || parsed;
          } catch {
            return null;
          }
        },
      },
      authentication: {
        recordMethod: (url: string) => {
          authenticationMethods.push({
            name: url,
            timestamp: new Date().toISOString(),
          });
        },
      },
      access: {
        deny: (code: string, reason?: string) => {
          accessDenied = true;
          denyCode = code;
          denyReason = reason || "";
        },
      },
      accessToken: {
        setCustomClaim: (claim: string, value: unknown) => {
          customAccessTokenClaims[claim] = value;
        },
      },
      idToken: {
        setCustomClaim: (claim: string, value: unknown) => {
          customIdTokenClaims[claim] = value;
        },
      },
      token: createTokenAPI(ctx, tenant_id),
    });

    // If access was denied, return error response
    if (accessDenied) {
      if (!loginSession.authParams.redirect_uri) {
        throw new HTTPException(403, {
          message: denyReason || "Access denied",
        });
      }

      const redirectUrl = new URL(loginSession.authParams.redirect_uri);
      redirectUrl.searchParams.set("error", "access_denied");
      redirectUrl.searchParams.set(
        "error_description",
        denyReason || denyCode || "Access denied by hook",
      );
      if (loginSession.authParams.state) {
        redirectUrl.searchParams.set("state", loginSession.authParams.state);
      }

      return new Response(null, {
        status: 302,
        headers: { location: redirectUrl.toString() },
      });
    }

    // Store any recorded authentication methods in user metadata
    if (authenticationMethods.length > 0) {
      const existingMethods = (user.app_metadata?.authentication_methods as Array<{ name: string; timestamp: string }>) || [];
      await data.users.update(tenant_id, user.user_id, {
        app_metadata: {
          ...user.app_metadata,
          authentication_methods: [...existingMethods, ...authenticationMethods],
        },
      });
    }

    // Store custom claims in pipeline context to be added to tokens
    if (
      Object.keys(customAccessTokenClaims).length > 0 ||
      Object.keys(customIdTokenClaims).length > 0
    ) {
      await data.loginSessions.update(tenant_id, loginSession.id, {
        pipeline_state: {
          ...pipelineState,
          context: {
            ...pipelineState.context,
            customAccessTokenClaims,
            customIdTokenClaims,
          },
        },
      });
    }
  }

  // Advance the pipeline: clear current suspension and increment position
  const newPosition = pipelineState.position + 1;
  await data.loginSessions.update(tenant_id, loginSession.id, {
    pipeline_state: {
      position: newPosition,
      current: null,
      context: pipelineState.context,
    },
  });

  // Continue running the rest of the pipeline (form hooks, page hooks, etc.)
  // by calling postUserLoginHook with the updated session
  const updatedSession = await data.loginSessions.get(tenant_id, loginSession.id);
  if (updatedSession) {
    return postUserLoginHook(ctx, data, tenant_id, user, updatedSession, params);
  }

  return user;
}

// Backwards compatibility aliases
export const validateRegistrationUsername = validateSignupEmail;
export const preUserRegistrationHook = preUserSignupHook;
