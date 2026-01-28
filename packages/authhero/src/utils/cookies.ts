import { parse, serialize } from "cookie";
import {
  SILENT_AUTH_MAX_AGE_IN_SECONDS,
  SILENT_COOKIE_NAME,
} from "../constants";

function getCookieName(tenant_id: string) {
  return `${tenant_id}-${SILENT_COOKIE_NAME}`;
}

function getWildcardDomain(host: string) {
  // Return undefined for empty hostnames
  if (!host) {
    return undefined;
  }
  const [hostname] = host.split(":"); // Remove port if present
  if (!hostname) {
    return undefined;
  }

  // Don't apply wildcards to IP addresses or localhost
  if (hostname === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return undefined;
  }

  // Split the domain into parts
  const parts = hostname.split(".");

  // If the domain is a typical structure (like 'subdomain.domain.com')
  // Ensure it has at least two parts (subdomain  domain)
  if (parts.length > 2) {
    // Join the last two parts to get the main domain
    return `.${parts.slice(-2).join(".")}`; // For example, '.sesamy.com'
  }

  // For a case like 'domain.com' without subdomains
  return `.${hostname}`; // Just return the domain itself (e.g., '.sesamy.com')
}

/**
 * Get all values for a specific cookie name.
 * The `cookie` package's parse() only returns the first value for duplicate cookies.
 * This function returns all values to handle scenarios where users may have multiple
 * cookies with the same name due to:
 * - Domain conflicts (e.g., `.example.com` vs `auth.example.com`)
 * - Path conflicts
 * - Partitioned vs non-partitioned cookies (CHIPS)
 * - Browser quirks in cookie ordering
 */
export function getAllAuthCookies(
  tenant_id: string,
  cookieHeaders?: string,
): string[] {
  if (!cookieHeaders) {
    return [];
  }

  const cookieName = getCookieName(tenant_id);
  const values: string[] = [];

  // Parse cookie header manually to get all values for duplicate cookie names
  // Cookie header format: "name1=value1; name2=value2; name1=value3"
  const pairs = cookieHeaders.split(";");
  for (const pair of pairs) {
    const [name, ...valueParts] = pair.trim().split("=");
    if (name === cookieName && valueParts.length > 0) {
      // Rejoin with '=' in case the value contained '='
      values.push(valueParts.join("="));
    }
  }

  return values;
}

export function getAuthCookie(
  tenant_id: string,
  cookieHeaders?: string,
): string | undefined {
  if (!cookieHeaders) {
    return undefined;
  }
  const cookies = parse(cookieHeaders);
  return cookies[getCookieName(tenant_id)];
}

/**
 * TEMPORARY: Double-Clear mechanism for cookie migration
 * This can be removed after February 28th, 2026
 *
 * Clears both non-partitioned and partitioned cookies to ensure clean migration.
 * Returns an array of Set-Cookie headers.
 */
export function clearAuthCookie(tenant_id: string, hostname?: string) {
  const cookieName = getCookieName(tenant_id);
  const baseOptions = {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: 0,
    sameSite: "none" as const,
    domain: hostname ? getWildcardDomain(hostname) : undefined,
  };

  // Double-Clear: First clear non-partitioned cookie, then partitioned
  return [
    serialize(cookieName, "", baseOptions),
    serialize(cookieName, "", { ...baseOptions, partitioned: true }),
  ];
}

/**
 * TEMPORARY: Double-Clear mechanism for cookie migration
 * This can be removed after February 28th, 2026
 *
 * First clears any non-partitioned cookie, then sets the new partitioned cookie.
 * Returns an array of Set-Cookie headers.
 */
export function serializeAuthCookie(
  tenant_id: string,
  value: string,
  hostname?: string,
) {
  const cookieName = getCookieName(tenant_id);
  const baseOptions = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    domain: hostname ? getWildcardDomain(hostname) : undefined,
  };

  // Double-Clear: First clear non-partitioned cookie, then set partitioned
  return [
    serialize(cookieName, "", { ...baseOptions, maxAge: 0 }),
    serialize(cookieName, value, {
      ...baseOptions,
      maxAge: SILENT_AUTH_MAX_AGE_IN_SECONDS,
      partitioned: true,
    }),
  ];
}
