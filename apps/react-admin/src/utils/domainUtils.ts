/**
 * Shared utility functions for domain management
 */

// Cookie key constants
export const DOMAINS_COOKIE_KEY = "authhero_domains";
export const SELECTED_DOMAIN_COOKIE_KEY = "authhero_selected_domain";

// Domain configuration interface
export interface DomainConfig {
  url: string;
  clientId: string;
  restApiUrl?: string;
}

/**
 * Gets domains from cookies
 * Handles both formats (array of objects or array of strings) for backward compatibility
 */
export const getDomainFromCookies = (): DomainConfig[] => {
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${DOMAINS_COOKIE_KEY}=`))
    ?.split("=")[1];

  if (cookieValue) {
    try {
      const parsedData = JSON.parse(decodeURIComponent(cookieValue));

      // Handle both formats: array of objects with url property or array of strings
      if (Array.isArray(parsedData)) {
        return parsedData
          .filter((item) => item !== null && item !== undefined)
          .map((item) => {
            if (typeof item === "object" && item !== null && "url" in item) {
              return item as DomainConfig; // Return the full object with url and clientId
            } else {
              // Convert string domains to DomainConfig format (backward compatibility)
              return {
                url: String(item),
                clientId: "", // Empty clientId for legacy entries
              };
            }
          })
          .filter((domain) => domain.url.trim() !== ""); // Remove empty domains
      }
      return [];
    } catch (e) {
      console.error("Failed to parse domains cookie", e);
      return [];
    }
  }
  return [];
};

/**
 * Saves domains to cookies
 */
export const saveDomainsToCookies = (domains: DomainConfig[]): void => {
  const expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  document.cookie = `${DOMAINS_COOKIE_KEY}=${encodeURIComponent(JSON.stringify(domains))}; expires=${expirationDate.toUTCString()}; path=/`;
};

/**
 * Gets the selected domain from cookies
 * Falls back to first domain in the domains cookie if no selected domain is set
 */
export const getSelectedDomainFromCookie = (): string => {
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SELECTED_DOMAIN_COOKIE_KEY}=`))
    ?.split("=")[1];

  if (cookieValue) {
    try {
      return decodeURIComponent(cookieValue);
    } catch (e) {
      console.error("Failed to parse selected domain cookie", e);
      return "";
    }
  }

  // Fallback to first domain in domains cookie if no selected domain
  const domains = getDomainFromCookies();
  return domains[0]?.url || "";
};

/**
 * Saves the selected domain to cookie
 */
export const saveSelectedDomainToCookie = (domain: string): void => {
  const expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  document.cookie = `${SELECTED_DOMAIN_COOKIE_KEY}=${encodeURIComponent(domain)}; expires=${expirationDate.toUTCString()}; path=/`;
};

/**
 * Gets client ID for a specific domain from cookie
 * Falls back to environment variable if not found
 */
export const getClientIdFromCookie = (domain: string): string => {
  // Ensure domain is properly formatted for comparison
  const formattedDomain = domain.trim().replace(/^https?:\/\//, "");

  const domains = getDomainFromCookies();

  // Look for matching domain in the array
  for (const d of domains) {
    if (d.url === formattedDomain && d.clientId) {
      return d.clientId;
    }
  }

  // Fallback to environment variable
  const fallbackClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  console.warn(`Falling back to environment client ID: ${fallbackClientId}`);
  return fallbackClientId;
};

/**
 * Formats a domain string (removes protocol if present)
 */
export const formatDomain = (domain: string): string => {
  return domain.trim().replace(/^https?:\/\//, "");
};
