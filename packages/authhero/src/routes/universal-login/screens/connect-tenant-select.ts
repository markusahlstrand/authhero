/**
 * Connect Tenant Select screen — control-plane-only step in the consent flow.
 *
 * When `/connect/start` is hit on the multi-tenancy control plane, the user
 * picks which child tenant the IAT should be minted on. Each child tenant is
 * represented by an organization on the control plane whose `name` matches
 * the child tenant id (see @authhero/multi-tenancy provisioning hooks).
 *
 * Corresponds to: /u2/connect/select-tenant
 */

import type {
  UiScreen,
  FormNodeComponent,
  Organization,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { getAuthCookie } from "../../../utils/cookies";
import { RedirectException } from "../../../errors/redirect-exception";
import { escapeHtml } from "../sanitization-utils";
import { fetchAll } from "../../../utils/fetchAll";

interface ConnectConsentData {
  integration_type?: string;
  domain: string;
  return_to: string;
  scope?: string;
  caller_state: string;
  is_local_dev?: boolean;
  target_tenant_id?: string;
}

interface TenantOption {
  id: string;
  display_name: string;
}

function readConnectData(stateDataJson?: string): ConnectConsentData | null {
  if (!stateDataJson) return null;
  try {
    const parsed = JSON.parse(stateDataJson);
    const c = parsed.connect;
    if (
      c &&
      typeof c === "object" &&
      (c.integration_type === undefined ||
        typeof c.integration_type === "string") &&
      typeof c.domain === "string" &&
      typeof c.return_to === "string" &&
      typeof c.caller_state === "string"
    ) {
      return c as ConnectConsentData;
    }
  } catch {
    // fall through
  }
  return null;
}

function buildReturn(
  return_to: string,
  caller_state: string,
  extra: Record<string, string>,
): string {
  const url = new URL(return_to);
  url.searchParams.set("state", caller_state);
  for (const [k, v] of Object.entries(extra)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function listUserTenantOptions(
  context: ScreenContext,
  userId: string,
): Promise<TenantOption[]> {
  const { ctx, tenant } = context;
  const organizations = await fetchAll<Organization>(
    (params) =>
      ctx.env.data.userOrganizations.listUserOrganizations(
        tenant.id,
        userId,
        params,
      ),
    "organizations",
  );

  // Org name maps 1:1 to a child tenant id (see provisioning hooks).
  const resolved = await Promise.all(
    organizations.map(async (org): Promise<TenantOption | null> => {
      const childTenant = await ctx.env.data.tenants.get(org.name);
      if (!childTenant) return null;
      return {
        id: org.name,
        display_name: org.display_name || childTenant.friendly_name || org.name,
      };
    }),
  );
  return resolved.filter((o): o is TenantOption => o !== null);
}

// The connect flow is registered exclusively under /u2 — there is no /u
// counterpart. Hardcode the prefix so the screen does not pick up /u from
// client metadata (which the generic route handler derives from
// `universal_login_version`).
const CONNECT_ROUTE_PREFIX = "/u2";

export async function connectTenantSelectScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { ctx, tenant, branding, state, messages } = context;
  const routePrefix = CONNECT_ROUTE_PREFIX;

  const loginPath = await getLoginPath(context);
  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const session = authCookie
    ? await ctx.env.data.sessions.get(tenant.id, authCookie)
    : null;
  if (!session || session.revoked_at) {
    throw new RedirectException(
      `${loginPath}?state=${encodeURIComponent(state)}`,
    );
  }

  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  const connect = readConnectData(loginSession?.state_data);
  if (!connect) {
    throw new RedirectException(
      `${routePrefix}/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  const tenants = await listUserTenantOptions(context, session.user_id);
  const stateParam = encodeURIComponent(state);
  const cancelUrl = buildReturn(connect.return_to, connect.caller_state, {
    authhero_error: "cancelled",
  });

  if (tenants.length === 0) {
    const components: FormNodeComponent[] = [
      {
        id: "no-tenants",
        type: "RICH_TEXT",
        category: "BLOCK",
        visible: true,
        config: {
          content: `
            <div style="padding:16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:14px">
              You don't have access to any ${escapeHtml(tenant.friendly_name)} workspaces. Ask an administrator to invite you.
            </div>
          `,
        },
        order: 0,
      },
    ];
    const screen: UiScreen = {
      name: "connect-tenant-select",
      action: `${routePrefix}/connect/select-tenant?state=${stateParam}`,
      method: "POST",
      title: "Choose a workspace",
      description: "No workspaces available",
      components,
      links: [{ id: "cancel", text: "Cancel", href: cancelUrl }],
      messages,
    };
    return { screen, branding };
  }

  const components: FormNodeComponent[] = tenants.map((option, index) => ({
    id: `tenant_${option.id}`,
    type: "NEXT_BUTTON" as const,
    category: "BLOCK" as const,
    visible: true,
    config: {
      text: option.display_name,
    },
    order: index,
  }));

  const screen: UiScreen = {
    name: "connect-tenant-select",
    action: `${routePrefix}/connect/select-tenant?state=${stateParam}`,
    method: "POST",
    title: "Choose a workspace",
    description: `Select which ${escapeHtml(tenant.friendly_name)} workspace ${escapeHtml(connect.domain)} should connect to.`,
    components,
    links: [{ id: "cancel", text: "Cancel", href: cancelUrl }],
    messages,
  };

  return { screen, branding };
}

async function handleConnectTenantSelectSubmit(
  context: ScreenContext,
  data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, state } = context;
  const routePrefix = CONNECT_ROUTE_PREFIX;

  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const session = authCookie
    ? await ctx.env.data.sessions.get(tenant.id, authCookie)
    : null;
  if (!session || session.revoked_at) {
    return {
      error: "Not authenticated",
      screen: await connectTenantSelectScreen(context),
    };
  }

  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  const connect = readConnectData(loginSession?.state_data);
  if (!connect || !loginSession) {
    return {
      error: "Connect session expired",
      screen: await connectTenantSelectScreen(context),
    };
  }

  const selectedKey = Object.keys(data).find((k) => k.startsWith("tenant_"));
  if (!selectedKey) {
    return {
      error: "No tenant selected",
      screen: await connectTenantSelectScreen(context),
    };
  }
  const selectedTenantId = selectedKey.replace("tenant_", "");

  // Re-validate that the user actually has access to the selected tenant.
  const allowed = await listUserTenantOptions(context, session.user_id);
  if (!allowed.some((t) => t.id === selectedTenantId)) {
    return {
      error: "You don't have access to that workspace",
      screen: await connectTenantSelectScreen(context),
    };
  }

  const previousState = loginSession.state_data
    ? JSON.parse(loginSession.state_data)
    : {};
  await ctx.env.data.loginSessions.update(tenant.id, state, {
    state_data: JSON.stringify({
      ...previousState,
      connect: {
        ...connect,
        target_tenant_id: selectedTenantId,
      },
    }),
  });

  return {
    redirect: `${routePrefix}/connect/start?state=${encodeURIComponent(state)}`,
  };
}

export const connectTenantSelectScreenDefinition: ScreenDefinition = {
  id: "connect-tenant-select",
  name: "Connect Tenant Select",
  description:
    "Pick which child tenant the consent-mediated IAT should be minted on",
  handler: {
    get: connectTenantSelectScreen,
    post: handleConnectTenantSelectSubmit,
  },
};
