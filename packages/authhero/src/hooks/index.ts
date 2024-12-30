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

function createUserHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user: User) => {
    // Check for existing user with the same email and if so link the users
    let result = await linkUsersHook(data)(tenant_id, user);
    // Invoke post-user-registration webhooks
    await postUserRegistrationWebhook(ctx, data)(tenant_id, result);

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
    // If there is another user with the same email, allow the signup as they will be linked together
    const existingUser = await getPrimaryUserByEmail({
      userAdapter: ctx.env.data.users,
      tenant_id: client.tenant.id,
      email,
    });

    if (!existingUser) {
      const log = createLogMessage(ctx, {
        type: LogTypes.FAILED_SIGNUP,
        description: "Public signup is disabled",
      });
      await ctx.env.data.logs.create(client.tenant.id, log);

      throw new HTTPException(400, {
        message: "Signups are disabled for this client",
      });
    }
  }

  await preUserSignupWebhook(ctx, data)(ctx.var.tenant_id || "", email);
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
