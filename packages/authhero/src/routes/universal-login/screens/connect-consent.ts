/**
 * Connect Consent screen — AuthHero-specific consent flow that mints
 * an Initial Access Token (RFC 7591 §3) bound to the consenting user.
 *
 * Corresponds to: /u2/connect/start
 */

import type {
  UiScreen,
  FormNodeComponent,
  DataAdapters,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { getAuthCookie } from "../../../utils/cookies";
import { RedirectException } from "../../../errors/redirect-exception";
import { escapeHtml } from "../sanitization-utils";
import { mintIat } from "../../../helpers/dcr/mint-iat";
import { requireClientRegistrationTokens } from "../../auth-api/register/shared";
import { logMessage } from "../../../helpers/logging";
import { LogTypes } from "@authhero/adapter-interfaces";

interface ConnectConsentData {
  integration_type?: string;
  domain: string;
  return_to: string;
  scope?: string;
  caller_state: string;
  is_local_dev?: boolean;
  /**
   * The tenant the IAT will be minted on. Set by the connect-tenant-select
   * screen when the request was made against a multi-tenancy control plane.
   * When unset, the request's resolved tenant is used directly.
   */
  target_tenant_id?: string;
}

/**
 * Returns true when the resolved tenant is the multi-tenancy control plane
 * and the consent flow therefore needs an explicit child-tenant pick before
 * the IAT can be minted.
 */
function isControlPlaneTenant(
  data: { multiTenancyConfig?: { controlPlaneTenantId?: string } },
  tenantId: string,
): boolean {
  const cpId = data.multiTenancyConfig?.controlPlaneTenantId;
  return Boolean(cpId) && cpId === tenantId;
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

// The connect flow is registered exclusively under /u2 — there is no /u
// counterpart. Hardcode the prefix so the screen does not pick up /u from
// client metadata (which the generic route handler derives from
// `universal_login_version`).
const CONNECT_ROUTE_PREFIX = "/u2";

async function isUserInOrganization(
  data: DataAdapters,
  tenantId: string,
  userId: string,
  organizationName: string,
): Promise<boolean> {
  const perPage = 100;
  let page = 0;
  while (true) {
    const { organizations } =
      await data.userOrganizations.listUserOrganizations(tenantId, userId, {
        per_page: perPage,
        page,
      });
    if (organizations.some((o) => o.name === organizationName)) {
      return true;
    }
    if (organizations.length < perPage) {
      return false;
    }
    page += 1;
  }
}

export async function connectConsentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { ctx, tenant, branding, state, messages } = context;
  const routePrefix = CONNECT_ROUTE_PREFIX;

  // Resolve session — bounce to login if missing.
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
  const user = await ctx.env.data.users.get(tenant.id, session.user_id);
  if (!user) {
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

  // Control-plane mode: bounce to the tenant picker until a target child
  // tenant has been chosen. Direct-to-child mode skips this branch entirely.
  if (
    isControlPlaneTenant(ctx.env.data, tenant.id) &&
    !connect.target_tenant_id
  ) {
    throw new RedirectException(
      `${routePrefix}/connect/select-tenant?state=${encodeURIComponent(state)}`,
    );
  }

  const stateParam = encodeURIComponent(state);
  const cancelUrl = buildReturn(connect.return_to, connect.caller_state, {
    authhero_error: "cancelled",
  });

  const scopeBlock = connect.scope
    ? `<div style="margin-top:12px;font-size:13px;color:#6b7280">Requested permissions: <span style="color:#111827;font-weight:500">${escapeHtml(connect.scope)}</span></div>`
    : "";

  const localDevBadge = connect.is_local_dev
    ? `<span title="This site is a non-production local development origin. The connection will not work outside this machine or network." style="display:inline-block;margin-left:8px;padding:2px 8px;font-size:11px;font-weight:500;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:9999px;vertical-align:middle">Local development</span>`
    : "";

  // When a child tenant was selected on a control plane, surface its
  // friendly name so the user understands which workspace they're granting
  // access to. Falls back to the tenant id when no friendly_name is set.
  let targetWorkspaceLabel: string | null = null;
  if (connect.target_tenant_id && connect.target_tenant_id !== tenant.id) {
    const targetTenant = await ctx.env.data.tenants.get(
      connect.target_tenant_id,
    );
    targetWorkspaceLabel =
      targetTenant?.friendly_name || connect.target_tenant_id;
  }
  const workspaceLine = targetWorkspaceLabel
    ? `<div style="font-size:13px;color:#6b7280;margin-top:4px">Workspace: <span style="color:#111827;font-weight:500">${escapeHtml(targetWorkspaceLabel)}</span></div>`
    : "";

  const components: FormNodeComponent[] = [
    {
      id: "connect-summary",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `
          <div style="display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">
            ${connect.integration_type ? `<div style="font-size:14px;color:#6b7280">${escapeHtml(connect.integration_type)}</div>` : ""}
            <div style="font-size:18px;font-weight:600;color:#111827">${escapeHtml(connect.domain)}${localDevBadge}</div>
            <div style="font-size:14px;color:#374151">wants to connect to your ${escapeHtml(tenant.friendly_name)} account as <span style="font-weight:500">${escapeHtml(user.email || user.name || user.user_id)}</span>.</div>
            ${workspaceLine}
            ${scopeBlock}
          </div>
        `,
      },
      order: 0,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Connect",
      },
      order: 1,
    },
  ];

  const screen: UiScreen = {
    name: "connect-consent",
    action: `${routePrefix}/connect/start?state=${stateParam}`,
    method: "POST",
    title: "Connect application",
    description: `Allow ${connect.domain} to act on your behalf?`,
    components,
    links: [
      {
        id: "cancel",
        text: "Cancel",
        href: cancelUrl,
      },
    ],
    messages,
  };

  return { screen, branding };
}

async function handleConnectConsentSubmit(
  context: ScreenContext,
  _data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, state } = context;

  // Resolve session inline (mirrors the GET handler).
  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const session = authCookie
    ? await ctx.env.data.sessions.get(tenant.id, authCookie)
    : null;
  if (!session || session.revoked_at) {
    return {
      error: "Not authenticated",
      screen: await connectConsentScreen(context),
    };
  }
  const user = await ctx.env.data.users.get(tenant.id, session.user_id);
  if (!user) {
    return {
      error: "Not authenticated",
      screen: await connectConsentScreen(context),
    };
  }

  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  const connect = readConnectData(loginSession?.state_data);
  if (!connect || !loginSession) {
    return {
      error: "Connect session expired",
      screen: await connectConsentScreen(context),
    };
  }

  // On the control plane the user MUST have picked a target tenant before
  // we mint anything — guard against a direct POST that skipped the picker.
  if (
    isControlPlaneTenant(ctx.env.data, tenant.id) &&
    !connect.target_tenant_id
  ) {
    return {
      error: "Workspace selection required",
      screen: await connectConsentScreen(context),
    };
  }

  // Resolve the tenant the IAT will be minted on. Direct-to-child requests
  // mint on the resolved request tenant; control-plane requests mint on the
  // child tenant chosen in the picker step.
  const targetTenantId = connect.target_tenant_id ?? tenant.id;

  // For control-plane minting, re-validate that the consenting user actually
  // has membership in the org corresponding to the chosen child tenant. The
  // picker enforces this, but a stale or tampered state_data must not let a
  // user mint on a tenant they don't belong to.
  if (connect.target_tenant_id && connect.target_tenant_id !== tenant.id) {
    const allowed = await isUserInOrganization(
      ctx.env.data,
      tenant.id,
      user.user_id,
      connect.target_tenant_id,
    );
    if (!allowed) {
      return {
        error: "You don't have access to that workspace",
        screen: await connectConsentScreen(context),
      };
    }
    const targetTenant = await ctx.env.data.tenants.get(targetTenantId);
    if (!targetTenant) {
      return {
        error: "Workspace not found",
        screen: await connectConsentScreen(context),
      };
    }
  }

  // POST always means confirm — the Cancel link already redirects to
  // return_to with `authhero_error=cancelled` without ever submitting.
  // Mint an IAT bound to the consenting user.
  const constraints: Record<string, unknown> = {
    domain: connect.domain,
    grant_types: ["client_credentials"],
  };
  if (connect.integration_type) {
    constraints.integration_type = connect.integration_type;
  }
  if (connect.scope) {
    constraints.scope = connect.scope;
  }

  const minted = await mintIat(
    requireClientRegistrationTokens(ctx.env.data),
    targetTenantId,
    {
      sub: user.user_id,
      constraints,
      single_use: true,
      expires_in_seconds: 300,
    },
  );

  await logMessage(ctx, targetTenantId, {
    type: LogTypes.SUCCESS_API_OPERATION,
    description: "DCR Initial Access Token issued via /connect/start",
    targetType: "client_registration_token",
    targetId: minted.id,
    userId: user.user_id,
  });

  // Carry the target tenant id to the caller so it knows which tenant to
  // POST /oidc/register against. Only set when it differs from the request
  // tenant — direct-to-child callers already know the tenant from the host.
  const extra: Record<string, string> = { authhero_iat: minted.token };
  if (targetTenantId !== tenant.id) {
    extra.authhero_tenant = targetTenantId;
  }

  return {
    redirect: buildReturn(connect.return_to, connect.caller_state, extra),
  };
}

export const connectConsentScreenDefinition: ScreenDefinition = {
  id: "connect-consent",
  name: "Connect Consent",
  description: "Consent-mediated DCR Initial Access Token issuance",
  handler: {
    get: connectConsentScreen,
    post: handleConnectConsentSubmit,
  },
};
