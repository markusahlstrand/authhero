import { Context } from "hono";
import { Connection, Strategy } from "@authhero/adapter-interfaces";
import * as apple from "./apple";
import * as facebook from "./facebook";
import * as google from "./google-oauth2";
import * as vipps from "./vipps";
import * as github from "./github";
import * as windowslive from "./windowslive";
import * as waad from "./waad";
import * as oidc from "./oidc";
import * as oauth2 from "./oauth2";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";

/**
 * Resolve the redirect_uri that strategies should hand to the upstream IdP.
 * Defaults to `${authUrl}login/callback` on the request's host (custom domain
 * if present, otherwise the default issuer) — matching Auth0's default. Set
 * `options.callback_url` per connection to pin an explicit URL — required
 * when an upstream IdP has the legacy `/callback` URL registered and you
 * don't want it to flip when the request comes in via a custom domain.
 */
export function getConnectionCallbackUrl(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
): string {
  return (
    connection.options?.callback_url ??
    `${getAuthUrl(ctx.env, ctx.var.custom_domain)}login/callback`
  );
}

export type UserInfo = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
};

/**
 * Verified result returned by strategies that also expose the unmodified
 * upstream payload (id_token payload, userinfo response, etc.). Used by the
 * "Try Connection" diagnostic flow to surface raw provider claims to the
 * caller — production flows only consume `userinfo`.
 */
export type UserInfoWithRaw = {
  userinfo: UserInfo;
  raw: Record<string, unknown> | null;
};

export type StrategyHandler = {
  displayName: string;
  logoDataUri: string;
  getRedirect: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    loginHint?: string,
  ) => Promise<{ redirectUrl: string; code: string; codeVerifier?: string }>;
  validateAuthorizationCodeAndGetUser: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    code: string,
    codeVerifier?: string,
  ) => Promise<UserInfo>;
  // Optional variant returning the raw upstream payload alongside the
  // normalized `UserInfo`. When unimplemented, the try-connection flow
  // falls back to `validateAuthorizationCodeAndGetUser` and surfaces
  // `raw: null` — strategies are expected to add this incrementally.
  validateAuthorizationCodeAndGetUserWithRaw?: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    code: string,
    codeVerifier?: string,
  ) => Promise<UserInfoWithRaw>;
  disableEmbeddedBrowsers?: boolean;
};

// Built-in strategies that can be displayed on the login page
export const BUILTIN_STRATEGIES: Record<string, StrategyHandler> = {
  [Strategy.APPLE]: apple,
  [Strategy.FACEBOOK]: facebook,
  [Strategy.GOOGLE_OAUTH2]: google,
  [Strategy.VIPPS]: vipps,
  [Strategy.GITHUB]: github,
  [Strategy.WINDOWSLIVE]: windowslive,
  [Strategy.WAAD]: waad,
  [Strategy.OIDC]: oidc,
  [Strategy.OAUTH2]: oauth2,
};

export function getStrategy(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  name: string,
): StrategyHandler {
  const envStrategies = ctx.env.STRATEGIES || {};

  const strategies: Record<string, StrategyHandler> = {
    ...BUILTIN_STRATEGIES,
    ...envStrategies,
  };

  const strategy = strategies[name];
  if (!strategy) {
    throw new Error(`Strategy ${name} not found`);
  }

  return strategy;
}

// Enterprise strategies (used for classifying the auth session, not for
// provider-prefix resolution — Auth0 prefixes user_ids with the strategy
// name regardless of social/enterprise; the connection name is embedded
// elsewhere in the id body for samlp/oidc).
export const ENTERPRISE_STRATEGIES = new Set<string>([
  Strategy.OIDC,
  Strategy.SAMLP,
  Strategy.WAAD,
  Strategy.ADFS,
  Strategy.OAUTH2,
]);

// Get provider name from a connection (Auth0 compatible).
// Auth0 always prefixes user_ids with the strategy name:
//   windowslive|<sub>, waad|<oid>, samlp|<conn>|<nameid>, oidc|<conn>|<sub>.
export function getProviderFromConnection(connection: Connection): string {
  return connection.strategy;
}

// Envelope icon for passwordless (email/SMS) connections
const PASSWORDLESS_ICON =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%225%22%20y%3D%2210%22%20width%3D%2235%22%20height%3D%2225%22%20rx%3D%223%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M5%2013l17.5%2012L40%2013%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E";

/**
 * Get the icon URL for a connection, falling back to strategy defaults
 */
export function getConnectionIconUrl(connection: {
  strategy: string;
  options?: { icon_url?: string };
}): string | undefined {
  // First, check for custom icon_url in connection options
  if (connection.options?.icon_url) {
    return connection.options.icon_url;
  }
  // Passwordless strategies get an envelope icon
  if (
    connection.strategy === Strategy.EMAIL ||
    connection.strategy === Strategy.SMS
  ) {
    return PASSWORDLESS_ICON;
  }
  // Fall back to strategy's logoDataUri
  const strategy = BUILTIN_STRATEGIES[connection.strategy];
  return strategy?.logoDataUri;
}
