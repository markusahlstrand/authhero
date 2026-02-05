import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
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

export type Strategy = {
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
export const BUILTIN_STRATEGIES: Record<string, Strategy> = {
  apple,
  facebook,
  "google-oauth2": google,
  vipps,
  github,
  microsoft,
  oidc,
  oauth2,
};

export function getStrategy(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  name: string,
): Strategy {
  const envStrategies = ctx.env.STRATEGIES || {};

  const strategies: Record<string, Strategy> = {
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
export const ENTERPRISE_STRATEGIES = new Set([
  "oidc",
  "samlp",
  "waad",
  "adfs",
  "oauth2",
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
  // Fall back to strategy's logoDataUri
  const strategy = BUILTIN_STRATEGIES[connection.strategy];
  return strategy?.logoDataUri;
}
