import { Context } from "hono";
import { LoginSessionState } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { JSONHTTPException } from "../errors/json-http-exception";
import { getEnrichedClient } from "../helpers/client";
import { setTenantId } from "../helpers/set-tenant-id";
import { createFrontChannelAuthResponse } from "./common";

// Matches the adapter-side truncation applied to authorization_url.
const AUTHORIZATION_URL_MAX_LENGTH = 1024;

function sharesRegistrableDomain(a: string, b: string): boolean {
  // Strip ports before comparing. This is a simple last-two-labels
  // heuristic (no Public Suffix List), used only as a fallback when the
  // target host is not a registered custom domain.
  const labelsA = a.split(":")[0]?.split(".") ?? [];
  const labelsB = b.split(":")[0]?.split(".") ?? [];
  if (labelsA.length < 2 || labelsB.length < 2) return false;
  const rootA = labelsA.slice(-2).join(".");
  const rootB = labelsB.slice(-2).join(".");
  return rootA === rootB;
}

async function isTrustedAuthorizationHost(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  targetHost: string,
  currentHost: string,
): Promise<boolean> {
  const domain = await ctx.env.data.customDomains.getByDomain(targetHost);
  if (domain) return true;
  return sharesRegistrableDomain(targetHost, currentHost);
}

/**
 * Handler for `GET /authorize/resume?state=<login_session_id>`.
 *
 * Auth0 exposes an identically-named endpoint (see
 * `app.pocketlaw.com.har`): after a Universal Login sub-flow submits the
 * user's credentials, the sub-flow 302s here rather than issuing tokens
 * inline. This endpoint is the single terminal site that:
 *
 *  1. Hops to the original authorization host if the browser is on the
 *     wrong custom domain (so the session cookie lands under the right
 *     wildcard).
 *  2. Dispatches based on the LoginSessionMachine state.
 *  3. Delegates the actual token/code issuance (and cookie write) to
 *     `createFrontChannelAuthResponse`, which already handles MFA /
 *     passkey-nudge / response-mode branching.
 */
export async function resumeLoginSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
): Promise<Response> {
  // loginSessions.get() currently ignores tenant_id, so we can look up by
  // the state (login_session_id) before we know the tenant.
  const loginSession = await ctx.env.data.loginSessions.get(
    ctx.var.tenant_id || "",
    state,
  );
  if (!loginSession) {
    throw new JSONHTTPException(403, { message: "State not found" });
  }

  // Cross-domain hop. If /authorize was originally served from a different
  // custom domain than where the browser landed on /authorize/resume, send
  // it back to the original host before we set any cookie. This is the
  // role that connection.ts used to play with a 307 to /callback.
  //
  // The target host is treated as untrusted input: validate length, parse,
  // and confirm it is either a registered custom domain or shares the
  // registrable domain of the current host. Anything else falls through
  // and is served on the current host (no redirect).
  const rawAuthUrl = loginSession.authorization_url;
  if (
    rawAuthUrl &&
    rawAuthUrl.length <= AUTHORIZATION_URL_MAX_LENGTH
  ) {
    let authzUrl: URL | null = null;
    try {
      authzUrl = new URL(rawAuthUrl);
    } catch {
      authzUrl = null;
    }
    const currentHost = ctx.var.host || "";
    if (authzUrl && authzUrl.host && authzUrl.host !== currentHost) {
      const trusted = await isTrustedAuthorizationHost(
        ctx,
        authzUrl.host,
        currentHost,
      );
      if (trusted) {
        const target = new URL("/authorize/resume", authzUrl.origin);
        target.searchParams.set("state", state);
        return new Response(null, {
          status: 302,
          headers: {
            location: target.toString(),
          },
        });
      }
    }
  }

  const client = await getEnrichedClient(
    ctx.env,
    loginSession.authParams.client_id,
  );
  setTenantId(ctx, client.tenant.id);
  ctx.set("client_id", client.client_id);

  const currentState = loginSession.state || LoginSessionState.PENDING;

  if (currentState === LoginSessionState.PENDING) {
    // Someone hit /authorize/resume without completing a sub-flow first.
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "Login session is not yet authenticated",
    });
  }

  if (currentState === LoginSessionState.COMPLETED) {
    // Replay: the session already issued its tokens.
    throw new JSONHTTPException(409, {
      error: "invalid_request",
      error_description: "Login session has already been completed",
    });
  }

  if (currentState === LoginSessionState.FAILED) {
    throw new JSONHTTPException(400, {
      error: "access_denied",
      error_description: `Login session failed: ${loginSession.failure_reason || "unknown reason"}`,
    });
  }

  if (currentState === LoginSessionState.EXPIRED) {
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "Login session has expired",
    });
  }

  // AUTHENTICATED or AWAITING_* — rehydrate user and delegate.
  // createFrontChannelAuthResponse already detects AWAITING_MFA /
  // passkey-nudge / continuation states and redirects to the right UL
  // screen, so we don't need to duplicate that dispatch.
  if (!loginSession.user_id) {
    throw new JSONHTTPException(500, {
      message: "Authenticated login session has no user_id",
    });
  }

  const user = await ctx.env.data.users.get(
    client.tenant.id,
    loginSession.user_id,
  );
  if (!user) {
    throw new JSONHTTPException(500, {
      message: "Authenticated user not found",
    });
  }

  ctx.set("user_id", user.user_id);
  if (loginSession.auth_connection) {
    ctx.set("connection", loginSession.auth_connection);
  }

  return createFrontChannelAuthResponse(ctx, {
    authParams: loginSession.authParams,
    client,
    user,
    loginSession,
    authStrategy: loginSession.auth_strategy,
    authConnection: loginSession.auth_connection,
  });
}
