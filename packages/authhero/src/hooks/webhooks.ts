import {
  DataAdapters,
  Hook,
  LogTypes,
  User,
} from "@authhero/adapter-interfaces";
import { createLogMessage } from "../utils/create-log-message";
import { Context } from "hono";
import { Variables, Bindings } from "../types";

async function invokeHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  hooks: Hook[],
  data: any,
) {
  for await (const hook of hooks) {
    const response = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const log = createLogMessage(ctx, {
        type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
        description: "Invalid password",
      });
      await data.logs.create(ctx.var.tenant_id, log);
    }
  }
}

export function postUserRegistrationWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await data.hooks.list(tenant_id);

    await invokeHooks(ctx, hooks, {
      tenant_id,
      user,
      trigger_id: "post-user-registration",
    });

    return user;
  };
}

export function preUserSignupWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, email: string): Promise<void> => {
    const { hooks } = await data.hooks.list(tenant_id, {
      q: "trigger_id:pre-user-signup",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    await invokeHooks(ctx, hooks, {
      tenant_id,
      email,
      trigger_id: "pre-user-signup",
    });
  };
}

export function postUserLoginWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await data.hooks.list(tenant_id, {
      q: "trigger_id:post-user-login",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    await invokeHooks(ctx, hooks, {
      tenant_id,
      user,
      trigger_id: "post-user-login",
    });

    return user;
  };
}
