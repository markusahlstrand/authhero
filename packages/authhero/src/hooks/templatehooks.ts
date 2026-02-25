import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { User } from "@authhero/adapter-interfaces";
import { OnExecuteCredentialsExchangeAPI, HookEvent } from "../types/Hooks";
import * as preDefinedHooks from "./pre-defined";

// Type guard for template hooks
export function isTemplateHook(
  hook: any,
): hook is { template_id: string; enabled: boolean } {
  return (
    typeof hook === "object" &&
    hook !== null &&
    typeof hook.template_id === "string" &&
    typeof hook.enabled === "boolean"
  );
}

/**
 * Handles a template hook by executing the corresponding pre-defined hook function.
 * Template hooks map to code-level pre-defined hooks that can be enabled per-tenant
 * through the admin UI without requiring server configuration changes.
 */
export async function handleTemplateHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  template_id: string,
  user: User,
): Promise<User> {
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    return user;
  }

  switch (template_id) {
    case "ensure-username": {
      const hookFn = preDefinedHooks.ensureUsername();
      await hookFn(
        {
          ctx,
          user,
          tenant: { id: tenant_id },
          request: {
            ip: ctx.get("ip") || "",
            url: ctx.req.url,
          },
        } as any,
        {
          prompt: { render: () => { } },
          redirect: {
            sendUserTo: () => { },
            encodeToken: () => "",
            validateToken: () => null,
          },
          token: {
            createServiceToken: async () => "",
          },
        },
      );
      // ensureUsername modifies the user in the database, re-fetch
      const updatedUser = await ctx.env.data.users.get(
        tenant_id,
        user.user_id,
      );
      return updatedUser || user;
    }
    default:
      console.warn(`[templatehooks] Unknown template_id: ${template_id}`);
      return user;
  }
}

/**
 * Handles a credentials-exchange template hook by executing the corresponding
 * pre-defined hook function that sets custom claims on tokens.
 */
export async function handleCredentialsExchangeTemplateHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  template_id: string,
  user: User,
  api: OnExecuteCredentialsExchangeAPI,
): Promise<void> {
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    return;
  }

  const event: HookEvent = {
    ctx,
    user,
    tenant: { id: tenant_id },
    request: {
      ip: ctx.get("ip") || "",
      url: ctx.req.url,
      method: ctx.req.method,
      user_agent: ctx.get("useragent") || "",
    },
  };

  switch (template_id) {
    case "set-preferred-username": {
      const hookFn = preDefinedHooks.setPreferredUsername();
      await hookFn(event, api);
      break;
    }
    default:
      console.warn(
        `[templatehooks] Unknown credentials-exchange template_id: ${template_id}`,
      );
  }
}
