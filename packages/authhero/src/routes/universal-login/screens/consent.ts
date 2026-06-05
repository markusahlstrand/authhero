/**
 * OAuth Consent screen — shown for third-party clients when they request
 * non-basic scopes the user has not previously consented to.
 *
 * Corresponds to: /u2/consent
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import {
  LoginSessionState,
  AuthorizationResponseMode,
  AuthorizationResponseType,
  LogTypes,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { getAuthCookie } from "../../../utils/cookies";
import { RedirectException } from "../../../errors/redirect-exception";
import { escapeHtml } from "../sanitization-utils";
import { logMessage } from "../../../helpers/logging";
import {
  transitionLoginSession,
  LoginSessionEventType,
} from "../../../state-machines/login-session";
import { computeMissingConsentScopes } from "../../../helpers/consent";

const ROUTE_PREFIX = "/u2";

function shouldUseFragment(
  response_type: AuthorizationResponseType | undefined,
  response_mode: AuthorizationResponseMode | undefined,
): boolean {
  if (response_mode === AuthorizationResponseMode.QUERY) return false;
  if (response_mode === AuthorizationResponseMode.FRAGMENT) return true;
  return response_type !== AuthorizationResponseType.CODE;
}

function buildErrorRedirectUrl(
  redirect_uri: string,
  response_type: AuthorizationResponseType | undefined,
  response_mode: AuthorizationResponseMode | undefined,
  errorParams: Record<string, string>,
): string {
  const errorUrl = new URL(redirect_uri);
  if (shouldUseFragment(response_type, response_mode)) {
    errorUrl.hash = new URLSearchParams(errorParams).toString();
  } else {
    for (const [k, v] of Object.entries(errorParams)) {
      errorUrl.searchParams.set(k, v);
    }
  }
  return errorUrl.toString();
}

export async function consentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { ctx, tenant, client, branding, state, messages } = context;

  const loginPath = await getLoginPath(context);
  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  if (!loginSession) {
    throw new RedirectException(
      `${ROUTE_PREFIX}/login/identifier?state=${encodeURIComponent(state)}`,
    );
  }

  // Prefer the auth cookie; fall back to the session_id persisted on the
  // login session. The cookie isn't set yet on the FIRST navigation from the
  // post-authenticate consent redirect (createFrontChannelAuthResponse only
  // attaches Set-Cookie to its terminal redirect, not to interstitial ones).
  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const sessionId = authCookie ?? loginSession.session_id;
  const session = sessionId
    ? await ctx.env.data.sessions.get(tenant.id, sessionId)
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

  // Deny short-circuit: the Deny link points back to this screen with ?deny=1,
  // so we can centralize the cancel response here without registering a
  // separate route. form_post mode falls back to a query-string redirect on
  // this path — acceptable for v1 since user-initiated denial is rare.
  const denyQuery = ctx.req.query("deny");
  if (denyQuery === "1") {
    const { state: failedState } = transitionLoginSession(
      loginSession.state || LoginSessionState.AWAITING_CONSENT,
      { type: LoginSessionEventType.FAIL, reason: "consent_denied" },
    );
    await ctx.env.data.loginSessions.update(tenant.id, loginSession.id, {
      state: failedState,
      failure_reason: "consent_denied",
    });
    await logMessage(ctx, tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: "User denied OAuth consent",
      userId: user.user_id,
    });

    const errorParams: Record<string, string> = {
      error: "access_denied",
      error_description: "User denied consent",
    };
    if (loginSession.authParams.state) {
      errorParams.state = loginSession.authParams.state;
    }
    throw new RedirectException(
      buildErrorRedirectUrl(
        loginSession.authParams.redirect_uri ?? "",
        loginSession.authParams.response_type,
        loginSession.authParams.response_mode,
        errorParams,
      ),
    );
  }

  // Without a grants adapter we cannot persist an approval, so the GET
  // would render a consent form whose POST silently no-ops and bounces back
  // here via /authorize/resume — an infinite loop. Fail-closed with an
  // access_denied to the client instead.
  if (!ctx.env.data.grants) {
    const errorParams: Record<string, string> = {
      error: "access_denied",
      error_description: "Consent storage is not configured",
    };
    if (loginSession.authParams.state) {
      errorParams.state = loginSession.authParams.state;
    }
    throw new RedirectException(
      buildErrorRedirectUrl(
        loginSession.authParams.redirect_uri ?? "",
        loginSession.authParams.response_type,
        loginSession.authParams.response_mode,
        errorParams,
      ),
    );
  }

  const requestedScopes =
    loginSession.authParams.scope?.split(" ").filter(Boolean) ?? [];
  const stored = await ctx.env.data.grants.get(
    tenant.id,
    user.user_id,
    client.client_id,
  );
  const missing = computeMissingConsentScopes(
    requestedScopes,
    stored?.scope ?? [],
  );

  // Nothing to consent to (basic scopes only or already covered) — let the
  // /authorize/resume path re-evaluate the session.
  if (missing.length === 0) {
    throw new RedirectException(
      `/authorize/resume?state=${encodeURIComponent(state)}`,
    );
  }

  const stateParam = encodeURIComponent(state);
  const clientLabel = client.name || client.client_id;

  const scopeListHtml = missing
    .map(
      (scope) =>
        `<li style="font-size:14px;color:#374151;padding:4px 0">${escapeHtml(scope)}</li>`,
    )
    .join("");

  const components: FormNodeComponent[] = [
    {
      id: "consent-summary",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `
          <div style="display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">
            <div style="font-size:18px;font-weight:600;color:#111827">${escapeHtml(clientLabel)}</div>
            <div style="font-size:14px;color:#374151">wants to access your ${escapeHtml(tenant.friendly_name || tenant.id)} account as <span style="font-weight:500">${escapeHtml(user.email || user.name || user.user_id)}</span>.</div>
            <div style="font-size:13px;color:#6b7280;margin-top:8px">It will be able to:</div>
            <ul style="margin:0;padding-left:20px">${scopeListHtml}</ul>
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
      config: { text: "Allow" },
      order: 1,
    },
  ];

  const denyUrl = `${ROUTE_PREFIX}/consent?state=${stateParam}&deny=1`;
  const screen: UiScreen = {
    name: "consent",
    action: `${ROUTE_PREFIX}/consent?state=${stateParam}`,
    method: "POST",
    title: "Authorize application",
    description: `Allow ${clientLabel} to access your account?`,
    components,
    links: [{ id: "deny", text: "Deny", href: denyUrl }],
    messages,
  };

  return { screen, branding };
}

async function handleConsentSubmit(
  context: ScreenContext,
  _data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, client, state } = context;

  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  if (!loginSession) {
    return {
      error: "Consent session expired",
      screen: await consentScreen(context),
    };
  }

  // Same cookie-vs-loginSession fallback as the GET handler — the auth cookie
  // may not be present on the first POST after a fresh login.
  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const sessionId = authCookie ?? loginSession.session_id;
  const session = sessionId
    ? await ctx.env.data.sessions.get(tenant.id, sessionId)
    : null;
  if (!session || session.revoked_at) {
    return { error: "Not authenticated", screen: await consentScreen(context) };
  }
  const user = await ctx.env.data.users.get(tenant.id, session.user_id);
  if (!user) {
    return { error: "Not authenticated", screen: await consentScreen(context) };
  }

  // POST = approve. The Deny link goes back through GET with ?deny=1 so we
  // never have a POST-deny case here. The GET path already fails-closed when
  // the grants adapter is missing, but guard again so a direct POST can't
  // bypass it.
  if (!ctx.env.data.grants) {
    return { error: "Consent storage is not configured", screen: await consentScreen(context) };
  }

  const requestedScopes =
    loginSession.authParams.scope?.split(" ").filter(Boolean) ?? [];

  if (requestedScopes.length > 0) {
    await ctx.env.data.grants.create(tenant.id, {
      user_id: user.user_id,
      clientID: client.client_id,
      scope: requestedScopes,
    });
  }

  const { state: nextState } = transitionLoginSession(
    loginSession.state || LoginSessionState.AWAITING_CONSENT,
    { type: LoginSessionEventType.COMPLETE_CONSENT },
  );
  await ctx.env.data.loginSessions.update(tenant.id, loginSession.id, {
    state: nextState,
  });

  await logMessage(ctx, tenant.id, {
    type: LogTypes.SUCCESS_LOGIN,
    description: "User granted OAuth consent",
    userId: user.user_id,
  });

  return {
    redirect: `/authorize/resume?state=${encodeURIComponent(state)}`,
  };
}

export const consentScreenDefinition: ScreenDefinition = {
  id: "consent",
  name: "OAuth Consent",
  description: "User consent for third-party OAuth scopes",
  handler: {
    get: consentScreen,
    post: handleConsentSubmit,
  },
};
