import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  GrantType,
  TokenResponse,
  User,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { authorizationCodeGrantUser } from "../../authentication-flows/authorization-code";
import { issueTokensForGrant } from "../../authentication-flows/grant-tokens";
import { EnrichedClient, getEnrichedClient } from "../../helpers/client";
import { logMessage } from "../../helpers/logging";
import { ssrfFetchOptionsFromEnv } from "../../utils/ssrf-fetch";
import { getIssuer } from "../../variables";

export type InfoCodeExchangeResult =
  | { ok: true; tokens: TokenResponse; user: User; client: EnrichedClient }
  | { ok: false; error: string; error_description: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Pull a human-readable error out of the exceptions the token grant throws.
 * `JSONHTTPException` serialises its body into `message`; plain
 * `HTTPException`s carry the text directly.
 */
function describeGrantError(err: HTTPException): {
  error: string;
  error_description: string;
} {
  try {
    const body: unknown = JSON.parse(err.message);
    if (isRecord(body)) {
      const error =
        typeof body.error === "string" ? body.error : "invalid_grant";
      const description =
        typeof body.error_description === "string"
          ? body.error_description
          : typeof body.message === "string"
            ? body.message
            : err.message;
      return { error, error_description: description };
    }
  } catch {
    // Not JSON — fall through to the raw message.
  }
  return { error: "invalid_grant", error_description: err.message };
}

/**
 * The single browser-facing origin this page is served from: the configured
 * issuer's scheme (https for custom domains, whatever ISSUER says otherwise)
 * on the browser-facing host resolved by the tenant middleware. Behind a
 * proxy the internal request URL may be plain http on an internal host; it
 * must never authorize a cleartext twin of the public origin, so it is not
 * consulted for the origin at all.
 */
function trustedPageOrigin(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): string | null {
  const host = ctx.var.host;
  if (!host) return null;
  try {
    const issuer = new URL(getIssuer(ctx.env, ctx.var.custom_domain));
    return new URL(`${issuer.protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * True when `redirectUri` points at the page currently being served: exact
 * match on the trusted browser-facing origin (scheme + host) and on the
 * request path.
 */
function isRedirectToThisPage(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  redirectUri: string | undefined,
): boolean {
  if (!redirectUri) return false;
  const trustedOrigin = trustedPageOrigin(ctx);
  if (!trustedOrigin) return false;
  let target: URL;
  let current: URL;
  try {
    target = new URL(redirectUri);
    current = new URL(ctx.req.url);
  } catch {
    return false;
  }
  return (
    target.origin === trustedOrigin && target.pathname === current.pathname
  );
}

/**
 * Redeem an authorization code that was issued with the info page itself as
 * `redirect_uri`, using the client's own credentials on the server side.
 *
 * The page lives on the auth server, so it can complete the exchange without
 * the browser ever seeing a client secret. The redirect_uri guard is
 * load-bearing: without it a code intercepted from any other redirect target
 * could be pasted into this page and redeemed with the client's secret.
 */
export async function exchangeInfoPageCode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  code: string,
): Promise<InfoCodeExchangeResult> {
  const codeRecord = await ctx.env.data.codes.get(
    tenantId,
    code,
    "authorization_code",
  );
  const loginSession = codeRecord
    ? await ctx.env.data.loginSessions.get(tenantId, codeRecord.login_id)
    : null;
  const clientId = loginSession?.authParams.client_id;

  if (!codeRecord || !loginSession || !clientId) {
    return {
      ok: false,
      error: "invalid_grant",
      error_description:
        "The authorization code is invalid, expired or has already been used.",
    };
  }

  const redirectUri =
    codeRecord.redirect_uri ?? loginSession.authParams.redirect_uri;
  if (!isRedirectToThisPage(ctx, redirectUri)) {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      description: "Authorization code was not issued for the info page",
    });
    return {
      ok: false,
      error: "invalid_grant",
      error_description:
        "The authorization code was not issued for this page and cannot be exchanged here.",
    };
  }

  const client = await getEnrichedClient(
    ctx.env,
    clientId,
    tenantId,
    ssrfFetchOptionsFromEnv(ctx.env),
  );
  ctx.set("client_id", client.client_id);

  try {
    const grantResult = await authorizationCodeGrantUser(ctx, {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      redirect_uri: redirectUri,
      client_secret: client.client_secret,
    });
    const tokens = await issueTokensForGrant(
      ctx,
      grantResult,
      GrantType.AuthorizationCode,
    );
    return { ok: true, tokens, user: grantResult.user, client };
  } catch (err) {
    if (err instanceof HTTPException) {
      return { ok: false, ...describeGrantError(err) };
    }
    throw err;
  }
}
