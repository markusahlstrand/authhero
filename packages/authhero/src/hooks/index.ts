import {
  Client,
  DataAdapters,
  LogTypes,
  User,
} from "@authhero/adapter-interfaces";
import { linkUsersHook } from "./link-users";
import { postUserRegistrationWebhook, preUserSignupWebhook } from "./webhooks";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getPrimaryUserByEmail } from "../helpers/users";
import { createLogMessage } from "../utils/create-log-message";
import { HTTPException } from "hono/http-exception";
import { HookRequest } from "../types/Hooks";

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
    // Check if prompt=signup was specified in the authorization URL
    const isExplicitSignup =
      ctx.var.loginSession?.authParams?.prompt === "signup";

    // If prompt=signup was specified, allow the signup regardless of the disable_sign_ups setting
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
