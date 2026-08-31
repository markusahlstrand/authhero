import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { User } from "@authhero/adapter-interfaces";
import {
  OnExecuteCredentialsExchangeAPI,
  OnExecutePostLogin,
  OnExecutePostLoginAPI,
  HookEvent,
} from "../types/Hooks";
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
 * The post-login API surface handed to a template hook.
 *
 * Template hooks run from the data layer rather than from inside the
 * universal-login loop, so there is no page to render and no browser to
 * redirect. Every member is a no-op; the pre-defined hooks used as templates
 * only mutate the user through `event.ctx.env.data`.
 */
const NOOP_POST_LOGIN_API: OnExecutePostLoginAPI = {
  prompt: { render: () => {} },
  redirect: {
    sendUserTo: () => {},
    encodeToken: () => "",
    validateToken: () => null,
  },
  token: {
    createServiceToken: async () => "",
  },
};

/**
 * Runs a pre-defined post-login hook as a template hook and returns the
 * resulting user.
 *
 * Both template hooks write the user back through the data adapter rather
 * than returning it, so the stored row is re-fetched afterwards — for
 * `account-linking` this also resolves `linked_to` to the primary user.
 */
async function runTemplateHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  user: User,
  hookFn: OnExecutePostLogin,
): Promise<User> {
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

  await hookFn(event, NOOP_POST_LOGIN_API);

  const updatedUser = await ctx.env.data.users.get(tenant_id, user.user_id);
  return updatedUser || user;
}

/**
 * Handles a template hook by executing the corresponding pre-defined hook function.
 * Template hooks map to code-level pre-defined hooks that can be enabled per-tenant
 * through the admin UI without requiring server configuration changes.
 *
 * `metadata` carries the configuring tenant's options for the template — see
 * `hookBaseCommonProperties.metadata` in the adapter-interfaces Hook schema.
 * Each template that takes options reads its keys from here.
 */
export async function handleTemplateHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  template_id: string,
  user: User,
  metadata?: Record<string, unknown>,
): Promise<User> {
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    return user;
  }

  switch (template_id) {
    case "ensure-username":
      return runTemplateHook(
        ctx,
        tenant_id,
        user,
        preDefinedHooks.ensureUsername(),
      );
    case "account-linking":
      return runTemplateHook(
        ctx,
        tenant_id,
        user,
        preDefinedHooks.accountLinking({
          copyUserMetadata: metadata?.copy_user_metadata === true,
        }),
      );
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
