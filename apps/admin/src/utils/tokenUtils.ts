import { DomainConfig, formatDomain } from "./domainUtils";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { getConfigValue } from "./runtimeConfig";

// In-memory caches for access tokens. The Auth0 SDK cache key is
// clientId+audience+scope only, so a token fetched for org A would be served
// for a later request that wanted no org (or a different org). We maintain our
// own caches and force `cacheMode: "off"` to bypass the SDK cache for both
// org-scoped and non-org-scoped tokens.
//
// Entries hold the in-flight promise (not just the resolved token) so that N
// parallel callers on a cold cache share a single refresh-token exchange
// instead of each firing their own.
const orgTokenCache = new Map<
  string,
  { promise: Promise<string>; expiresAt: number }
>();
const nonOrgTokenCache = new Map<
  string,
  { promise: Promise<string>; expiresAt: number }
>();

// Decode JWT payload (Base64URL → Base64). Used both for cache TTL and for
// verifying the org_id of a cached entry before we serve it.
function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Url = token.split(".")[1]!;
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  return JSON.parse(atob(padded));
}

function getTokenExpiryMs(token: string): number {
  const payload = decodeJwtPayload(token);
  return (payload.exp as number) * 1000;
}

// Whether a cached token's organization matches what we want. Guards against a
// stale entry (e.g. one populated under the wrong assumptions, or surviving a
// Vite HMR reload) being served as if it were correct.
//
// Callers pass the slug they used as `organization` in the token request — the
// server resolves slug → id and stamps `org_id` (the id) and `org_name` (the
// slug) into the JWT. So accept a match on either claim.
function tokenMatchesOrg(
  token: string,
  expectedOrg: string | undefined,
): boolean {
  try {
    const payload = decodeJwtPayload(token);
    if (expectedOrg === undefined) {
      return payload.org_id === undefined && payload.org_name === undefined;
    }
    return payload.org_id === expectedOrg || payload.org_name === expectedOrg;
  } catch {
    return false;
  }
}

/**
 * Get an access token scoped to a specific organization using refresh tokens.
 * Caches tokens in memory and only calls the token endpoint when expired.
 */
export async function getOrgAccessToken(
  auth0Client: Auth0Client,
  orgId: string,
  audience: string,
  domain: string,
): Promise<string> {
  const normalizedOrgId = orgId.toLowerCase();
  const cacheKey = `${domain}|${audience}|${normalizedOrgId}`;
  const cached = orgTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    const token = await cached.promise;
    if (tokenMatchesOrg(token, normalizedOrgId)) {
      return token;
    }
    orgTokenCache.delete(cacheKey);
  } else if (cached) {
    orgTokenCache.delete(cacheKey);
  }

  const promise = auth0Client.getTokenSilently({
    cacheMode: "off" as const,
    authorizationParams: { audience, organization: normalizedOrgId },
  });
  // Optimistic expiry so concurrent callers reuse this in-flight promise;
  // tightened to the JWT's real exp once resolved.
  orgTokenCache.set(cacheKey, {
    promise,
    expiresAt: Date.now() + 5 * 60_000,
  });
  try {
    const token = await promise;
    orgTokenCache.set(cacheKey, {
      promise: Promise.resolve(token),
      expiresAt: getTokenExpiryMs(token),
    });
    return token;
  } catch (err) {
    orgTokenCache.delete(cacheKey);
    throw err;
  }
}

/**
 * Get a non-org-scoped access token. Mirrors `getOrgAccessToken`: keeps its
 * own cache and forces `cacheMode: "off"` so a previously-cached org-scoped
 * token (which lives under the same SDK cache key) cannot be returned here.
 */
async function getNonOrgAccessToken(
  auth0Client: Auth0Client,
  audience: string,
  domain: string,
): Promise<string> {
  const cacheKey = `${domain}|${audience}`;
  const cached = nonOrgTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    const token = await cached.promise;
    if (tokenMatchesOrg(token, undefined)) {
      return token;
    }
    nonOrgTokenCache.delete(cacheKey);
  } else if (cached) {
    nonOrgTokenCache.delete(cacheKey);
  }

  const promise = auth0Client.getTokenSilently({
    cacheMode: "off" as const,
    authorizationParams: { audience, organization: undefined },
  });
  nonOrgTokenCache.set(cacheKey, {
    promise,
    expiresAt: Date.now() + 5 * 60_000,
  });
  try {
    const token = await promise;
    nonOrgTokenCache.set(cacheKey, {
      promise: Promise.resolve(token),
      expiresAt: getTokenExpiryMs(token),
    });
    return token;
  } catch (err) {
    nonOrgTokenCache.delete(cacheKey);
    throw err;
  }
}

async function fetchTokenWithClientCredentials(
  domain: string,
  clientId: string,
  clientSecret: string,
  organizationId?: string,
): Promise<string> {
  const body: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    // Use the management API audience for cross-tenant operations
    audience: "urn:authhero:management",
    scope:
      "read:users update:users create:users delete:users read:user_idp_tokens " +
      "read:clients update:clients create:clients delete:clients " +
      "read:connections update:connections create:connections delete:connections " +
      "read:resource_servers update:resource_servers create:resource_servers delete:resource_servers " +
      "read:rules update:rules create:rules delete:rules " +
      "read:email_templates update:email_templates " +
      "read:tenant_settings update:tenant_settings " +
      "read:logs read:stats read:branding update:branding read:forms",
  };

  // Add organization if specified - this will include org_id in the token
  // Normalize to lowercase to avoid casing mismatches
  if (organizationId) {
    body.organization = organizationId.toLowerCase();
  }

  const response = await fetch(`https://proxy.authhe.ro/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth0-Domain": domain,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch token with client credentials");
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Clear the organization token cache (e.g., on logout).
 */
export function clearOrganizationTokenCache(): void {
  orgTokenCache.clear();
  nonOrgTokenCache.clear();
}

/**
 * Get an organization-scoped token for the given domain configuration.
 * This token will have the org_id claim set to the specified organization.
 * Used for accessing tenant-specific resources.
 */
export async function getOrganizationToken(
  domainConfig: DomainConfig,
  organizationId: string,
): Promise<string> {
  if (
    domainConfig.connectionMethod === "client_credentials" &&
    domainConfig.clientId &&
    domainConfig.clientSecret
  ) {
    // For client credentials, fetch a token with organization parameter
    const token = await fetchTokenWithClientCredentials(
      domainConfig.url,
      domainConfig.clientId,
      domainConfig.clientSecret,
      organizationId,
    );
    return token;
  }

  // For token-based auth, we can't add org_id dynamically
  // The token must already have the correct org_id claim
  if (domainConfig.connectionMethod === "token") {
    // Static tokens cannot have dynamic org_id - this is a limitation
    throw new Error(
      "Token-based auth cannot provide organization-scoped tokens. " +
        "Use client_credentials or login authentication method for multi-tenant access.",
    );
  }

  // For login method, organization-scoped tokens are handled separately
  // via OAuth with organization parameter in createOrganizationHttpClient
  throw new Error(
    "Organization-scoped tokens require client_credentials or login authentication method.",
  );
}

/**
 * Get a token for the given domain configuration.
 * For OAuth login, this gets a token WITHOUT organization scope.
 * Use getOrgAccessToken for organization-scoped tokens.
 */
export default async function getToken(
  domainConfig: DomainConfig,
  auth0Client?: Auth0Client,
): Promise<string> {
  // Check if the domain config has a token
  if (domainConfig.connectionMethod === "token" && domainConfig.token) {
    return domainConfig.token;
  } else if (
    domainConfig.connectionMethod === "client_credentials" &&
    domainConfig.clientId &&
    domainConfig.clientSecret
  ) {
    // If using client credentials, generate a token
    const token = await fetchTokenWithClientCredentials(
      domainConfig.url,
      domainConfig.clientId,
      domainConfig.clientSecret,
    );
    return token;
  } else if (domainConfig.connectionMethod === "login" && auth0Client) {
    // Get a regular token WITHOUT organization scope. The SDK cache is keyed
    // on clientId+audience+scope (no org), so we must bypass it via
    // getNonOrgAccessToken — otherwise a cached org-scoped token from a prior
    // tenant page can be returned here and the tenants list endpoint will
    // filter results to that org.
    try {
      const audience = getConfigValue("audience") || "urn:authhero:management";
      const domain = formatDomain(domainConfig.url);
      return await getNonOrgAccessToken(auth0Client, audience, domain);
    } catch (error) {
      throw new Error(
        "Failed to get token from OAuth session. Please log in again.",
      );
    }
  }

  // If no token is available, throw an error
  throw new Error(
    "No authentication method available. Configure either a token or client credentials.",
  );
}
