import {
  Client,
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

export async function preUserSignupHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: Client,
  data: DataAdapters,
  email: string,
) {
  // Check the disabled flag on the client
  if (client.disable_sign_ups) {
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

export function addDataHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): DataAdapters {
  return {
    ...data,
    users: { ...data.users, create: createUserHooks(ctx, data) },
  };
}

/**
 * postUserLoginHook: Checks for post-user-login hooks (form or webhook) and handles:
 * - Form hooks: redirects to the first node in the form
 * - Webhook hooks: invokes the webhook and logs errors if any
 * If neither, returns the user as normal.
 */
export async function postUserLoginHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  tenant_id: string,
  user: User,
  loginSession?: LoginSession,
  params?: { client?: Client; authParams?: any },
): Promise<User | Response> {
  // Trigger any onExecutePostLogin hooks defined in ctx.env.hooks
  if (
    ctx.env.hooks?.onExecutePostLogin &&
    params?.client &&
    params?.authParams
  ) {
    await ctx.env.hooks.onExecutePostLogin(
      {
        client: params.client,
        user,
        request: {
          ip: ctx.req.header("x-real-ip") || "",
          user_agent: ctx.req.header("user-agent") || "",
          method: ctx.req.method,
          url: ctx.req.url,
        },
        scope: params.authParams.scope || "",
        grant_type: "",
      },
      {
        prompt: {
          render: (_formId: string) => {},
        },
      },
    );
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
