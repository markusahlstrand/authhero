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
import { stripInternalUserFields } from "../helpers/hook-user-payload";

export async function invokeHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  hooks: Hook[],
  data: any & { tenant_id: string },
) {
  // Sanitize the user payload once so every customer-facing webhook (and the
  // logging/customInvoker paths below) sees the same stripped user.
  if (data?.user) {
    data = { ...data, user: stripInternalUserFields(data.user as User) };
  }
  const customInvoker = ctx.env.webhookInvoker;

  const getServiceToken = async (scope = "webhook"): Promise<string> => {
    const result = await createServiceToken(ctx, data.tenant_id, scope);
    return result.access_token;
  };

  for await (const hook of hooks.filter((h) => "url" in h)) {
    let responseBody: string | undefined;
    let responseStatus: number | undefined;

    try {
      const startTime = performance.now();
      const response = customInvoker
        ? await customInvoker({
            hook,
            data,
            tenant_id: data.tenant_id,
            createServiceToken: getServiceToken,
          })
        : await fetch(hook.url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${await getServiceToken()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });
      const duration = performance.now() - startTime;

      // Add webhook call to server-timing header
      const existingHeader = ctx.res.headers.get("Server-Timing") || "";
      const timingEntry = `webhook-${hook.hook_id};dur=${duration.toFixed(2)}`;
      ctx.res.headers.set(
        "Server-Timing",
        existingHeader ? `${existingHeader}, ${timingEntry}` : timingEntry,
      );

      responseStatus = response.status;

      if (!response.ok) {
        try {
          responseBody = await response.text();
        } catch {
          // ignore read errors
        }

        const failDescription = `Failed to invoke hook ${hook.hook_id} - ${response.status} ${response.statusText}`;
        console.error(failDescription, {
          hook_url: hook.url,
          body: responseBody?.substring(0, 512),
        });
        await logMessage(ctx, data.tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: failDescription,
          userId: data.user?.user_id,
          details: {
            trigger_id: data.trigger_id,
            hook_id: hook.hook_id,
            hook_url: hook.url,
            user_id: data.user?.user_id,
            user_name: data.user?.name || data.user?.email,
            connection: data.user?.connection,
            response: {
              statusCode: responseStatus,
              body: responseBody?.substring(0, 512),
            },
          },
          connection: data.user?.connection,
          waitForCompletion: true,
        });
      }
    } catch (error) {
      const errorDescription = `Failed to invoke hook ${hook.hook_id} - ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(errorDescription, error);
      await logMessage(ctx, data.tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: errorDescription,
        userId: data.user?.user_id,
        details: {
          trigger_id: data.trigger_id,
          hook_id: hook.hook_id,
          hook_url: hook.url,
          user_id: data.user?.user_id,
          user_name: data.user?.name || data.user?.email,
          connection: data.user?.connection,
          error: error instanceof Error ? error.message : String(error),
        },
        connection: data.user?.connection,
        waitForCompletion: true,
      });
    }
  }
}

export function postUserRegistrationWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await ctx.env.data.hooks.list(tenant_id);
    const filtered = hooks.filter(
      (h) => h.trigger_id === "post-user-registration",
    );

    await invokeHooks(ctx, filtered, {
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
    const { hooks } = await ctx.env.data.hooks.list(tenant_id);
    const filtered = hooks.filter(
      (h) => h.trigger_id === "pre-user-registration",
    );

    await invokeHooks(ctx, filtered, {
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
    const { hooks } = await data.hooks.list(tenant_id);
    const filtered = hooks.filter((h) => h.trigger_id === "post-user-login");

    await invokeHooks(ctx, filtered, {
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
  const { hooks } = await ctx.env.data.hooks.list(tenant_id);

  return (
    hooks.find(
      (h) =>
        h.trigger_id === "validate-registration-username" &&
        "url" in h &&
        h.enabled,
    ) || null
  );
}

// Backwards compatibility alias
export const getValidateSignupEmailWebhook =
  getValidateRegistrationUsernameWebhook;

export function preUserDeletionWebhook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return async (tenant_id: string, user: User): Promise<User> => {
    const { hooks } = await ctx.env.data.hooks.list(tenant_id);
    const filtered = hooks.filter((h) => h.trigger_id === "pre-user-deletion");

    await invokeHooks(ctx, filtered, {
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
    const { hooks } = await ctx.env.data.hooks.list(tenant_id);
    const filtered = hooks.filter((h) => h.trigger_id === "post-user-deletion");

    await invokeHooks(ctx, filtered, {
      tenant_id,
      user,
      trigger_id: "post-user-deletion",
    });

    return user;
  };
}
