/**
 * Connect Consent screen — AuthHero-specific consent flow that mints
 * an Initial Access Token (RFC 7591 §3) bound to the consenting user.
 *
 * Corresponds to: /u2/connect/start
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
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
  integration_type: string;
  domain: string;
  return_to: string;
  scope?: string;
  caller_state: string;
}

function readConnectData(stateDataJson?: string): ConnectConsentData | null {
  if (!stateDataJson) return null;
  try {
    const parsed = JSON.parse(stateDataJson);
    const c = parsed.connect;
    if (
      c &&
      typeof c === "object" &&
      typeof c.integration_type === "string" &&
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

export async function connectConsentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { ctx, tenant, branding, state, messages, routePrefix = "/u2" } =
    context;

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
    throw new RedirectException(`${routePrefix}/login/identifier?state=${encodeURIComponent(state)}`);
  }

  const stateParam = encodeURIComponent(state);
  const cancelUrl = buildReturn(connect.return_to, connect.caller_state, {
    authhero_error: "cancelled",
  });

  const scopeBlock = connect.scope
    ? `<div style="margin-top:12px;font-size:13px;color:#6b7280">Requested permissions: <span style="color:#111827;font-weight:500">${escapeHtml(connect.scope)}</span></div>`
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
            <div style="font-size:14px;color:#6b7280">${escapeHtml(connect.integration_type)}</div>
            <div style="font-size:18px;font-weight:600;color:#111827">${escapeHtml(connect.domain)}</div>
            <div style="font-size:14px;color:#374151">wants to connect to your ${escapeHtml(tenant.friendly_name)} account as <span style="font-weight:500">${escapeHtml(user.email || user.name || user.user_id)}</span>.</div>
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

  // POST always means confirm — the Cancel link already redirects to
  // return_to with `authhero_error=cancelled` without ever submitting.
  // Mint an IAT bound to the consenting user.
  const constraints: Record<string, unknown> = {
    domain: connect.domain,
    integration_type: connect.integration_type,
    grant_types: ["client_credentials"],
  };
  if (connect.scope) {
    constraints.scope = connect.scope;
  }

  const minted = await mintIat(
    requireClientRegistrationTokens(ctx.env.data),
    tenant.id,
    {
      sub: user.user_id,
      constraints,
      single_use: true,
      expires_in_seconds: 300,
    },
  );

  await logMessage(ctx, tenant.id, {
    type: LogTypes.SUCCESS_API_OPERATION,
    description: "DCR Initial Access Token issued via /connect/start",
    targetType: "client_registration_token",
    targetId: minted.id,
    userId: user.user_id,
  });

  return {
    redirect: buildReturn(connect.return_to, connect.caller_state, {
      authhero_iat: minted.token,
    }),
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
