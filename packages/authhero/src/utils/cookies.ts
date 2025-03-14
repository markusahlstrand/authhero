import { parseCookies, serializeCookie } from "oslo/cookie";
import {
  SILENT_AUTH_MAX_AGE_IN_SECONDS,
  SILENT_COOKIE_NAME,
} from "../constants";

function getCookieName(tenant_id: string) {
  return `${tenant_id}-${SILENT_COOKIE_NAME}`;
}

function getWildcardDomain(hostname: string) {
  // Return undefined for empty hostnames
  if (!hostname) {
    return undefined;
  }

  // Don't apply wildcards to IP addresses or localhost
  if (hostname === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return hostname;
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

export function getAuthCookie(
  tenant_id: string,
  cookieHeaders?: string,
): string | undefined {
  if (!cookieHeaders) {
    return undefined;
  }
  const cookies = parseCookies(cookieHeaders);
  return cookies.get(getCookieName(tenant_id));
}

export function clearAuthCookie(tenant_id: string, hostname?: string) {
  return serializeCookie(getCookieName(tenant_id), "", {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: 0,
    sameSite: "none",
    domain: hostname ? getWildcardDomain(hostname) : undefined,
  });
}

export function serializeAuthCookie(
  tenant_id: string,
  value: string,
  hostname?: string,
) {
  return serializeCookie(getCookieName(tenant_id), value, {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: SILENT_AUTH_MAX_AGE_IN_SECONDS,
    sameSite: "none",
    domain: hostname ? getWildcardDomain(hostname) : undefined,
  });
}
