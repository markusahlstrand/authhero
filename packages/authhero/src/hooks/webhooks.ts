import {
  DataAdapters,
  Hook,
  LogTypes,
  User,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../helpers/logging";
import { Context } from "hono";
import { Variables, Bindings } from "../types";
import { createServiceToken } from "../helpers/service-token";

async function invokeHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  hooks: Hook[],
  data: any & { tenant_id: string },
) {
  const token = await createServiceToken(ctx, data.tenant_id, "webhook");

  for await (const hook of hooks.filter((h) => "url" in h)) {
    const response = await fetch(hook.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      logMessage(ctx, data.tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: `Failed to invoke hook ${hook.hook_id}`,
      });
    }
  }
}

export function postUserRegistrationWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await ctx.env.data.hooks.list(tenant_id);

    await invokeHooks(ctx, hooks, {
      tenant_id,
      user,
      trigger_id: "post-user-registration",
    });

    return user;
  };
}

export function preUserRegistrationWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return async (tenant_id: string, email: string): Promise<void> => {
    const { hooks } = await ctx.env.data.hooks.list(tenant_id, {
      q: "trigger_id:pre-user-registration",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    await invokeHooks(ctx, hooks, {
      tenant_id,
      email,
      trigger_id: "pre-user-registration",
    });
  };
}

// Backwards compatibility alias
export const preUserSignupWebhook = preUserRegistrationWebhook;

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

export async function getValidateRegistrationUsernameWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
): Promise<Hook | null> {
  const { hooks } = await ctx.env.data.hooks.list(tenant_id, {
    q: "trigger_id:validate-registration-username",
    page: 0,
    per_page: 1,
    include_totals: false,
  });

  return hooks.find((h) => "url" in h && h.enabled) || null;
}

// Backwards compatibility alias
export const getValidateSignupEmailWebhook =
  getValidateRegistrationUsernameWebhook;

export function preUserDeletionWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await ctx.env.data.hooks.list(tenant_id, {
      q: "trigger_id:pre-user-deletion",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    await invokeHooks(ctx, hooks, {
      tenant_id,
      user,
      trigger_id: "pre-user-deletion",
    });

    return user;
  };
}

export function postUserDeletionWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await ctx.env.data.hooks.list(tenant_id, {
      q: "trigger_id:post-user-deletion",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    await invokeHooks(ctx, hooks, {
      tenant_id,
      user,
      trigger_id: "post-user-deletion",
    });

    return user;
  };
}
