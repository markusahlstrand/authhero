/**
 * Shared utility functions for domain management
 */

// Storage key constants
export const DOMAINS_STORAGE_KEY = "authhero_domains";
export const SELECTED_DOMAIN_STORAGE_KEY = "authhero_selected_domain";

// Connection method types
export type ConnectionMethod = "login" | "token" | "client_credentials";

// Domain configuration interface
export interface DomainConfig {
  url: string;
  connectionMethod: ConnectionMethod;
  // Login method fields
  clientId?: string;
  restApiUrl?: string;
  // Token method field
  token?: string;
  // Client credentials method fields
  clientSecret?: string;
}

/**
 * Formats a domain string (removes protocol if present)
 */
export const formatDomain = (domain: string): string => {
  return domain.trim().replace(/^https?:\/\//, "");
};

/**
 * Gets default domain configuration from environment variables
 */
const getDefaultDomainFromEnv = (): DomainConfig | null => {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const apiUrl = import.meta.env.VITE_AUTH0_API_URL;

  if (!domain) {
    return null;
  }

  return {
    url: formatDomain(domain),
    connectionMethod: "login",
    clientId: clientId || undefined,
    restApiUrl: apiUrl || undefined,
  };
};

/**
 * Gets domains from localStorage
 * Handles both formats (array of objects or array of strings) for backward compatibility
 * Includes default domain from environment variables if not already in storage
 */
export const getDomainFromStorage = (): DomainConfig[] => {
  try {
    const storedValue = localStorage.getItem(DOMAINS_STORAGE_KEY);
    let domains: DomainConfig[] = [];

    if (storedValue) {
      const parsedData = JSON.parse(storedValue);

      // Handle both formats: array of objects with url property or array of strings
      if (Array.isArray(parsedData)) {
        domains = parsedData
          .filter((item) => item !== null && item !== undefined)
          .map((item) => {
            if (typeof item === "object" && item !== null && "url" in item) {
              // Add connectionMethod if it doesn't exist (for backward compatibility)
              if (!("connectionMethod" in item)) {
                return {
                  ...item,
                  connectionMethod: "login" as ConnectionMethod, // Assume login for existing entries
                } as DomainConfig;
              }
              return item as DomainConfig;
            } else {
              // Convert string domains to DomainConfig format (backward compatibility)
              return {
                url: String(item),
                connectionMethod: "login" as ConnectionMethod,
                clientId: "", // Empty clientId for legacy entries
              };
            }
          })
          .filter((domain) => domain.url.trim() !== ""); // Remove empty domains
      }
    }

    // Add or update default domain from environment if configured
    const defaultDomain = getDefaultDomainFromEnv();
    if (defaultDomain) {
      const existingIndex = domains.findIndex(
        (d) => formatDomain(d.url) === defaultDomain.url,
      );

      if (existingIndex >= 0) {
        // Update existing domain with environment config (env takes precedence)
        domains[existingIndex] = {
          ...domains[existingIndex],
          ...defaultDomain,
        };
      } else {
        // Add new domain at the beginning
        domains.unshift(defaultDomain);
      }
    }

    return domains;
  } catch (e) {
    console.error("Failed to parse domains from localStorage", e);
    // Return default domain from env if storage fails
    const defaultDomain = getDefaultDomainFromEnv();
    return defaultDomain ? [defaultDomain] : [];
  }
};

/**
 * Saves domains to localStorage
 */
export const saveDomainToStorage = (domains: DomainConfig[]): void => {
  try {
    localStorage.setItem(DOMAINS_STORAGE_KEY, JSON.stringify(domains));
  } catch (e) {
    console.error("Failed to save domains to localStorage", e);
  }
};

/**
 * Gets the selected domain from localStorage
 * Falls back to first domain in storage if no selected domain is set
 */
export const getSelectedDomainFromStorage = (): string => {
  try {
    const selectedDomain = localStorage.getItem(SELECTED_DOMAIN_STORAGE_KEY);
    if (selectedDomain) return selectedDomain;

    // Fallback to first domain in storage if no selected domain
    const domains = getDomainFromStorage();
    return domains[0]?.url || "";
  } catch (e) {
    console.error("Failed to get selected domain from localStorage", e);
    return "";
  }
};

/**
 * Saves the selected domain to localStorage
 */
export const saveSelectedDomainToStorage = (domain: string): void => {
  try {
    localStorage.setItem(SELECTED_DOMAIN_STORAGE_KEY, domain);
  } catch (e) {
    console.error("Failed to save selected domain to localStorage", e);
  }
};

/**
 * Gets client ID for a specific domain
 * Falls back to environment variable if not found
 */
export const getClientIdFromStorage = (domain: string): string => {
  // Ensure domain is properly formatted for comparison
  const formattedDomain = formatDomain(domain);

  const domains = getDomainFromStorage();

  // Look for matching domain in the array
  for (const d of domains) {
    if (d.url === formattedDomain && d.clientId) {
      return d.clientId;
    }
  }

  // Fallback to environment variable
  const fallbackClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  return fallbackClientId;
};

/**
 * Constructs a full URL with HTTPS protocol
 * - Always uses https:// for all domains (including localhost with self-signed certs)
 * - Preserves existing https:// protocol if already present
 * - Converts http:// to https://
 */
export const buildUrlWithProtocol = (domain: string): string => {
  const trimmedDomain = domain.trim();

  // Check if it already has a protocol
  if (trimmedDomain.startsWith("https://")) {
    return trimmedDomain;
  }

  // Convert http:// to https://
  if (trimmedDomain.startsWith("http://")) {
    return trimmedDomain.replace("http://", "https://");
  }

  // No protocol specified - add https://
  return `https://${trimmedDomain}`;
};
