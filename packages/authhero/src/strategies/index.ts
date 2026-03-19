import { Context } from "hono";
import { Connection, Strategy } from "@authhero/adapter-interfaces";
import * as apple from "./apple";
import * as facebook from "./facebook";
import * as google from "./google-oauth2";
import * as vipps from "./vipps";
import * as github from "./github";
import * as microsoft from "./microsoft";
import * as oidc from "./oidc";
import * as oauth2 from "./oauth2";
import { Bindings, Variables } from "../types";

export type UserInfo = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
};

export type StrategyHandler = {
  displayName: string;
  logoDataUri: string;
  getRedirect: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
  ) => Promise<{ redirectUrl: string; code: string; codeVerifier?: string }>;
  validateAuthorizationCodeAndGetUser: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    code: string,
    codeVerifier?: string,
  ) => Promise<UserInfo>;
  disableEmbeddedBrowsers?: boolean;
};

// Built-in strategies that can be displayed on the login page
export const BUILTIN_STRATEGIES: Record<string, StrategyHandler> = {
  [Strategy.APPLE]: apple,
  [Strategy.FACEBOOK]: facebook,
  [Strategy.GOOGLE_OAUTH2]: google,
  [Strategy.VIPPS]: vipps,
  [Strategy.GITHUB]: github,
  [Strategy.MICROSOFT]: microsoft,
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

// Enterprise strategies where provider = connection name (not strategy name)
export const ENTERPRISE_STRATEGIES = new Set<string>([
  Strategy.OIDC,
  Strategy.SAMLP,
  Strategy.WAAD,
  Strategy.ADFS,
  Strategy.OAUTH2,
]);

// Get provider name from a connection (Auth0 compatible)
// For enterprise connections (oidc, samlp, etc.), provider = connection.name
// For everything else (social, database, passwordless), provider = strategy name
export function getProviderFromConnection(connection: Connection): string {
  if (ENTERPRISE_STRATEGIES.has(connection.strategy)) {
    return connection.name;
  }
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
