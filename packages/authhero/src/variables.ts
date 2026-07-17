import { Bindings } from "./types";

export function getIssuer(env: Bindings, customDomain?: string) {
  if (customDomain) {
    return `https://${customDomain}/`;
  }
  return env.ISSUER;
}

export function getUniversalLoginUrl(
  env: Bindings,
  customDomain?: string,
  routePrefix: string = "u",
) {
  // Accept "/u2", "u2/" etc. and normalize to a bare path segment.
  const prefix = routePrefix.replace(/^\/+|\/+$/g, "") || "u";
  if (customDomain) {
    return `https://${customDomain}/${prefix}/`;
  }
  if (env.UNIVERSAL_LOGIN_URL) {
    // Treat the configured value as a base and inject the route prefix so
    // callers passing a routePrefix (e.g. "u2") target the right base instead
    // of the legacy path baked into UNIVERSAL_LOGIN_URL.
    const base = new URL(env.UNIVERSAL_LOGIN_URL);
    return `${base.origin}/${prefix}/`;
  }
  return `${env.ISSUER}${prefix}/`;
}

/**
 * Wildcard callback entries that always allow redirecting back to the auth
 * server itself (e.g. the /u/info and /u2/info test screens) without
 * per-client registration. The bases usually end in "/", so normalize before
 * appending "*" — a naive `${base}/*` yields a "//*" path whose wildcard
 * regex never matches a real pathname.
 */
export function getSelfCallbackWildcards(env: Bindings, customDomain?: string) {
  return [
    getIssuer(env, customDomain),
    getUniversalLoginUrl(env, customDomain),
  ].map((base) => `${base}${base.endsWith("/") ? "" : "/"}*`);
}

export function getAuthUrl(env: Bindings, customDomain?: string) {
  if (customDomain) {
    return `https://${customDomain}/`;
  }
  return env.OAUTH_API_URL || env.ISSUER;
}
