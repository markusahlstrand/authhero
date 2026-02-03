import { Auth0AuthProvider } from "ra-auth-auth0";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { ManagementClient } from "auth0";
import {
  getSelectedDomainFromStorage,
  getClientIdFromStorage,
  getDomainFromStorage,
  buildUrlWithProtocol,
  formatDomain,
} from "./utils/domainUtils";
import getToken, {
  clearOrganizationTokenCache,
  getOrganizationToken,
  OrgCache,
} from "./utils/tokenUtils";

// Track auth requests globally
let authRequestInProgress = false;
let lastAuthRequestTime = 0;
const AUTH_REQUEST_DEBOUNCE_MS = 1000; // Debounce time between auth requests

// Store active sessions by domain
const activeSessions = new Map<string, boolean>();

// Cache for auth0 clients (domain only, no org)
const auth0ClientCache = new Map<string, Auth0Client>();

// Cache for organization-specific auth0 clients (domain:orgId)
const auth0OrgClientCache = new Map<string, Auth0Client>();

// Cache for management clients
const managementClientCache = new Map<string, ManagementClient>();

// Create a function to get Auth0Client with the specified domain (no organization)
export const createAuth0Client = (domain: string) => {
  // Check cache first to avoid creating multiple clients for the same domain
  if (auth0ClientCache.has(domain)) {
    return auth0ClientCache.get(domain)!;
  }

  // Build full domain URL with HTTPS
  const fullDomain = buildUrlWithProtocol(domain);

  // Get redirect URI from current app URL
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}/auth-callback`;

  // Use the management API audience for cross-tenant operations
  // This allows the admin UI to manage tenants and their resources
  const audience =
    import.meta.env.VITE_AUTH0_AUDIENCE || "urn:authhero:management";

  const clientId = getClientIdFromStorage(domain);

  const auth0Client = new Auth0Client({
    domain: fullDomain,
    clientId,
    cacheLocation: "localstorage",
    useRefreshTokens: false,
    authorizationParams: {
      audience,
      redirect_uri: redirectUri,
      scope: "openid profile email",
    },
  });

  // Patch the loginWithRedirect method to prevent multiple calls
  const originalLoginWithRedirect =
    auth0Client.loginWithRedirect.bind(auth0Client);
  auth0Client.loginWithRedirect = async (options?: any) => {
    const now = Date.now();

    // Check if we already have an active session
    const hasActiveSession = await auth0Client.isAuthenticated();
    if (hasActiveSession) {
      return Promise.resolve();
    }

    // Prevent multiple auth requests in parallel or in quick succession
    if (
      authRequestInProgress ||
      now - lastAuthRequestTime < AUTH_REQUEST_DEBOUNCE_MS
    ) {
      return Promise.resolve();
    }

    try {
      authRequestInProgress = true;
      lastAuthRequestTime = now;
      activeSessions.set(domain, true);
      return await originalLoginWithRedirect(options);
    } finally {
      // Reset after redirect completes or fails
      setTimeout(() => {
        authRequestInProgress = false;
      }, 1000); // Give a short delay to prevent immediate retries
    }
  };

  // Also patch the handleRedirectCallback to signal when the auth flow is complete
  const originalHandleRedirectCallback =
    auth0Client.handleRedirectCallback.bind(auth0Client);
  auth0Client.handleRedirectCallback = async (url?: string) => {
    try {
      const result = await originalHandleRedirectCallback(url);
      return result;
    } finally {
      // Mark that this domain's auth flow is complete
      activeSessions.delete(domain);
      authRequestInProgress = false;
    }
  };

  // Store in cache
  auth0ClientCache.set(domain, auth0Client);
  return auth0Client;
};

/**
 * Create an Auth0Client for a specific organization with isolated cache.
 * This ensures tokens for different organizations don't interfere with each other.
 */
export const createAuth0ClientForOrg = (
  domain: string,
  organizationId: string,
) => {
  // Normalize organization ID to lowercase to avoid casing mismatches
  const normalizedOrgId = organizationId.toLowerCase();
  const cacheKey = `${domain}:${normalizedOrgId}`;

  // Check cache first
  if (auth0OrgClientCache.has(cacheKey)) {
    return auth0OrgClientCache.get(cacheKey)!;
  }

  // Build full domain URL with HTTPS
  const fullDomain = buildUrlWithProtocol(domain);

  // Get redirect URI from current app URL
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}/auth-callback`;

  // Use the management API audience for cross-tenant operations
  // The org_id claim in the token determines which tenant's resources are accessed
  const audience =
    import.meta.env.VITE_AUTH0_AUDIENCE || "urn:authhero:management";

  const clientId = getClientIdFromStorage(domain);

  const auth0Client = new Auth0Client({
    domain: fullDomain,
    clientId,
    useRefreshTokens: false,
    // Use organization-specific cache to isolate tokens
    // Note: Don't use cacheLocation when providing a custom cache
    cache: new OrgCache(normalizedOrgId),
    authorizationParams: {
      audience,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      organization: normalizedOrgId,
    },
  });

  // Store in cache
  auth0OrgClientCache.set(cacheKey, auth0Client);
  return auth0Client;
};

// Create a Management API client
export const createManagementClient = async (
  apiDomain: string,
  tenantId?: string,
  oauthDomain?: string,
): Promise<ManagementClient> => {
  // Normalize tenant ID to lowercase to avoid casing mismatches
  const normalizedTenantId = tenantId?.toLowerCase();
  const cacheKey = normalizedTenantId
    ? `${apiDomain}:${normalizedTenantId}`
    : apiDomain;

  // Check cache first
  if (managementClientCache.has(cacheKey)) {
    return managementClientCache.get(cacheKey)!;
  }

  // Use oauthDomain for finding credentials, fallback to apiDomain
  const domainForAuth = formatDomain(oauthDomain || apiDomain);
  const domains = getDomainFromStorage();
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === domainForAuth,
  );

  if (!domainConfig) {
    throw new Error(
      `No domain configuration found for domain: ${domainForAuth}`,
    );
  }

  let token: string;

  // Check if we're in single-tenant mode
  const storedFlag = sessionStorage.getItem("isSingleTenant");
  const isSingleTenant = storedFlag?.endsWith("|true") || storedFlag === "true";

  if (normalizedTenantId && !isSingleTenant) {
    // When accessing tenant-specific resources in MULTI-TENANT mode, use org-scoped token
    if (domainConfig.connectionMethod === "login") {
      // For OAuth login, use organization-scoped client
      const orgAuth0Client = createAuth0ClientForOrg(
        domainForAuth,
        normalizedTenantId,
      );

      const audience =
        import.meta.env.VITE_AUTH0_AUDIENCE || "urn:authhero:management";

      try {
        token = await orgAuth0Client.getTokenSilently({
          authorizationParams: {
            audience,
            organization: normalizedTenantId,
          },
        });
      } catch (error) {
        // If silent token acquisition fails, redirect to login with org
        // Get the base auth0 client to get the user's email for login hint
        const baseClient = createAuth0Client(domainForAuth);
        const user = await baseClient.getUser().catch(() => null);

        // Redirect to login with organization
        await orgAuth0Client.loginWithRedirect({
          authorizationParams: {
            organization: normalizedTenantId,
            login_hint: user?.email,
          },
          appState: {
            returnTo: window.location.pathname,
          },
        });

        // This won't be reached as loginWithRedirect redirects the page
        throw new Error(
          `Redirecting to login for organization ${normalizedTenantId}`,
        );
      }
    } else {
      // For token/client_credentials, use getOrganizationToken
      token = await getOrganizationToken(domainConfig, normalizedTenantId);
    }
  } else {
    // No tenantId - get non-org-scoped token for tenant management endpoints
    let auth0Client: Auth0Client | undefined;
    if (domainConfig.connectionMethod === "login") {
      auth0Client = createAuth0Client(domainForAuth);
    }
    token = await getToken(domainConfig, auth0Client);
  }

  // ManagementClient expects domain WITHOUT protocol (it adds https:// internally)
  const managementClient = new ManagementClient({
    domain: apiDomain,
    token,
    headers: normalizedTenantId
      ? { "tenant-id": normalizedTenantId }
      : undefined,
  });

  managementClientCache.set(cacheKey, managementClient);
  return managementClient;
};

// Clear management client cache when token might be expired
// Note: Clears the entire cache since cache keys use apiDomain[:tenantId]
// but callers typically only have access to the OAuth domain
export const clearManagementClientCache = () => {
  managementClientCache.clear();
  clearOrganizationTokenCache();
};

// Create a function to get the auth provider with the specified domain
export const getAuthProvider = (
  domain: string,
  onAuthComplete?: () => void,
) => {
  // Get domain config to check connection method
  const domains = getDomainFromStorage();
  const formattedDomain = formatDomain(domain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedDomain,
  );

  // If using token auth or client credentials, create a simple auth provider that uses the token
  if (
    ["token", "client_credentials"].includes(
      domainConfig?.connectionMethod || "",
    )
  ) {
    return {
      login: async () => {
        // Token auth is already authenticated
        return Promise.resolve();
      },
      logout: async () => {
        // Clear management client cache on logout
        clearManagementClientCache();
        return Promise.resolve();
      },
      checkError: async (error: any) => {
        if (error.status === 401 || error.statusCode === 401) {
          clearManagementClientCache();
          return Promise.reject();
        }
        return Promise.resolve();
      },
      checkAuth: async () => {
        // Verify that credentials are actually available
        if (!domainConfig) {
          return Promise.reject(new Error("No domain configuration found"));
        }

        if (domainConfig.connectionMethod === "token" && !domainConfig.token) {
          return Promise.reject(
            new Error("Token authentication selected but no token provided"),
          );
        }

        if (
          domainConfig.connectionMethod === "client_credentials" &&
          (!domainConfig.clientId || !domainConfig.clientSecret)
        ) {
          return Promise.reject(
            new Error(
              "Client credentials authentication selected but credentials missing",
            ),
          );
        }

        return Promise.resolve();
      },
      getIdentity: async () => {
        // Return a dummy UserIdentity for token-based auth
        return Promise.resolve({
          id: "token-user",
          fullName: "API Token User",
          avatar: undefined,
        });
      },
      getPermissions: async () => {
        return Promise.resolve(["admin"]);
      },
    };
  }

  // For non-token auth, use Auth0
  const auth0 = createAuth0Client(domain);

  // Get the current app's URL for redirect
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}`;

  const baseAuthProvider = Auth0AuthProvider(auth0, {
    // Use the current app's URL with the auth-callback path
    loginRedirectUri: `${redirectUri}/auth-callback`,
    // Use the current app's URL for logout
    logoutRedirectUri: redirectUri,
  });

  // Enhance the auth provider to signal when auth operations complete
  return {
    ...baseAuthProvider,
    login: async (params: any) => {
      try {
        const result = await baseAuthProvider.login(params);
        if (onAuthComplete) onAuthComplete();
        return result;
      } catch (error) {
        if (onAuthComplete) onAuthComplete();
        activeSessions.delete(domain);
        throw error;
      }
    },
    logout: async (params: any) => {
      try {
        clearManagementClientCache();
        const result = await baseAuthProvider.logout(params);
        if (onAuthComplete) onAuthComplete();
        return result;
      } catch (error) {
        if (onAuthComplete) onAuthComplete();
        throw error;
      }
    },
    checkAuth: async (params: any): Promise<void> => {
      try {
        // Don't check auth while on the callback page - we're in the middle of authenticating
        if (window.location.pathname === "/auth-callback") {
          // Return success to prevent redirect loops during callback processing
          return Promise.resolve();
        }

        // If auth is in progress, wait for it to complete
        if (authRequestInProgress || activeSessions.has(domain)) {
          return new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
              if (!authRequestInProgress && !activeSessions.has(domain)) {
                clearInterval(checkInterval);
                // Re-check auth now that the redirect is complete
                baseAuthProvider.checkAuth(params).then(resolve).catch(reject);
              }
            }, 100);

            // Timeout after 30 seconds
            setTimeout(() => {
              clearInterval(checkInterval);
              reject(new Error("Authentication timeout"));
            }, 30000);
          });
        }

        await baseAuthProvider.checkAuth(params);
        return;
      } catch (error) {
        if (onAuthComplete) onAuthComplete();
        activeSessions.delete(domain);
        clearManagementClientCache();
        throw error;
      }
    },
  };
};

// Create auth provider for the selected domain
const authProvider = getAuthProvider(getSelectedDomainFromStorage());

// Create a debounced http client to prevent parallel token requests
let pendingRequests = new Map<string, Promise<any>>();
interface HttpOptions extends RequestInit {
  headers?: HeadersInit;
}

const authorizedHttpClient = (url: string, options: HttpOptions = {}) => {
  const requestKey = `${url}-${JSON.stringify(options)}`;

  // If there's already a pending request for this URL and options, return it
  if (pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey)!;
  }

  // Prevent API calls while on the auth callback page
  if (window.location.pathname === "/auth-callback") {
    return Promise.reject({
      json: {
        message: "Authentication in progress. Please wait...",
      },
      status: 401,
      headers: new Headers(),
      body: JSON.stringify({ message: "Authentication in progress" }),
    });
  }

  // Check if we're using token-based auth or client credentials
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const formattedSelectedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedSelectedDomain,
  );

  // If using login method and auth request is in progress, delay the request
  if (
    domainConfig?.connectionMethod === "login" &&
    (authRequestInProgress || activeSessions.has(formattedSelectedDomain))
  ) {
    // Return a promise that waits for auth to complete
    const delayedRequest = new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (
          !authRequestInProgress &&
          !activeSessions.has(formattedSelectedDomain)
        ) {
          clearInterval(checkInterval);
          // Retry the request now that auth is complete
          authorizedHttpClient(url, options).then(resolve).catch(reject);
        }
      }, 100);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error("Authentication timeout"));
      }, 30000);
    });

    pendingRequests.set(requestKey, delayedRequest);
    delayedRequest.finally(() => {
      pendingRequests.delete(requestKey);
    });

    return delayedRequest;
  }

  // If no domain config found, throw an error
  if (!domainConfig) {
    return Promise.reject({
      json: {
        message:
          "No domain configuration found. Please select a domain and configure authentication.",
      },
      status: 401,
      headers: new Headers(),
      body: JSON.stringify({ message: "No domain configuration found" }),
    });
  }

  let request;
  if (
    ["token", "client_credentials"].includes(
      domainConfig.connectionMethod || "",
    )
  ) {
    // For token auth or client credentials, use the getToken helper
    request = getToken(domainConfig)
      .catch((error) => {
        // If we can't get a token, throw a more helpful error
        throw new Error(
          `Authentication failed: ${error.message}. Please configure your credentials in the domain selector.`,
        );
      })
      .then((token) => {
        let headersObj: Headers;
        const method = (options.method || "GET").toUpperCase();
        if (method === "GET") {
          // Only send Authorization for GET to avoid CORS issues
          headersObj = new Headers();
          headersObj.set("Authorization", `Bearer ${token}`);
        } else if (
          method === "POST" ||
          method === "DELETE" ||
          method === "PATCH"
        ) {
          // For POST, DELETE, PATCH: only send Authorization and content-type (force application/json for POST/PATCH)
          headersObj = new Headers();
          headersObj.set("Authorization", `Bearer ${token}`);
          if (method === "POST" || method === "PATCH") {
            headersObj.set("content-type", "application/json");
          }
        } else {
          // For other methods, merge all headers and set Authorization
          headersObj = new Headers(options.headers || {});
          headersObj.set("Authorization", `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers: headersObj });
      })
      .then(async (response) => {
        if (response.status < 200 || response.status >= 300) {
          const text = await response.text();

          // Check for 401 with "Bad audience" message on /v2/tenants endpoint - Auth0 doesn't support this endpoint
          if (
            response.status === 401 &&
            text.includes("Bad audience") &&
            url.includes("/v2/tenants")
          ) {
            console.warn(
              "Auth0 server detected without multi-tenant support. Navigating to Auth0 page",
            );
            // Clean up pending request to prevent deadlock
            pendingRequests.delete(requestKey);
            // Use history.pushState for a soft navigation instead of a hard redirect
            window.history.pushState({}, "", "/auth0");
            // Dispatch a navigation event so the app can respond to the URL change
            window.dispatchEvent(new PopStateEvent("popstate"));
            // Reject with a clear error message instead of hanging
            throw new Error("Navigating to Auth0 configuration");
          }

          throw new Error(response.statusText);
        }

        const text = await response.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          json = text;
        }

        // Return in the format expected by react-admin's dataProvider
        return {
          json,
          status: response.status,
          headers: response.headers,
          body: text,
        };
      })
      .catch((error) => {
        // Check for certificate errors (network failures when connecting to HTTPS with untrusted cert)
        if (error.message === "Failed to fetch" || error.name === "TypeError") {
          const urlObj = new URL(url);
          if (
            urlObj.hostname === "localhost" ||
            urlObj.hostname === "127.0.0.1"
          ) {
            const certError = new Error(
              `Unable to connect to ${urlObj.origin}. This may be due to an untrusted SSL certificate.\n\n` +
                `Please visit ${urlObj.origin} in your browser and accept the security warning to trust the certificate, then refresh this page.`,
            );
            (certError as any).isCertificateError = true;
            (certError as any).serverUrl = urlObj.origin;
            throw certError;
          }
        }
        throw error;
      });
  } else {
    // For Auth0 login method, get a token WITHOUT organization scope
    // This ensures we don't accidentally use an org-scoped token when listing tenants
    const currentAuth0Client = createAuth0Client(selectedDomain);
    request = getToken(domainConfig, currentAuth0Client)
      .catch((error) => {
        throw new Error(
          `Authentication failed: ${error.message}. Please log in again.`,
        );
      })
      .then((token) => {
        const headersObj = new Headers();
        headersObj.set("Authorization", `Bearer ${token}`);
        const method = (options.method || "GET").toUpperCase();
        if (method === "POST" || method === "PATCH") {
          headersObj.set("content-type", "application/json");
        }
        return fetch(url, { ...options, headers: headersObj });
      })
      .then(async (response) => {
        if (response.status < 200 || response.status >= 300) {
          const text = await response.text();

          // Check for 401 with "Bad audience" message on /v2/tenants endpoint
          if (
            response.status === 401 &&
            text.includes("Bad audience") &&
            url.includes("/v2/tenants")
          ) {
            console.warn(
              "Auth0 server detected without multi-tenant support. Navigating to Auth0 page",
            );
            pendingRequests.delete(requestKey);
            window.history.pushState({}, "", "/auth0");
            window.dispatchEvent(new PopStateEvent("popstate"));
            throw new Error("Navigating to Auth0 configuration");
          }

          throw new Error(text || response.statusText);
        }

        const text = await response.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          json = text;
        }

        return {
          json,
          status: response.status,
          headers: response.headers,
          body: text,
        };
      })
      .catch((error) => {
        if (error.message === "Failed to fetch" || error.name === "TypeError") {
          const urlObj = new URL(url);
          if (
            urlObj.hostname === "localhost" ||
            urlObj.hostname === "127.0.0.1"
          ) {
            const certError = new Error(
              `Unable to connect to ${urlObj.origin}. This may be due to an untrusted SSL certificate.`,
            );
            (certError as any).isCertificateError = true;
            (certError as any).serverUrl = urlObj.origin;
            throw certError;
          }
        }
        throw error;
      });
  }

  // Handle cleanup when request is done
  request.finally(() => {
    pendingRequests.delete(requestKey);
  });

  // Cache the request
  pendingRequests.set(requestKey, request);
  return request;
};

/**
 * Creates an HTTP client that uses organization-scoped tokens.
 * This is used when accessing tenant-specific resources to ensure
 * the user has the correct permissions for that tenant.
 *
 * @param organizationId - The organization/tenant ID to scope tokens to
 * @returns An HTTP client function that uses organization-scoped tokens
 */
export const createOrganizationHttpClient = (organizationId: string) => {
  // Normalize organization ID to lowercase to avoid casing mismatches
  const normalizedOrgId = organizationId.toLowerCase();

  return (url: string, options: HttpOptions = {}) => {
    const requestKey = `${normalizedOrgId}:${url}-${JSON.stringify(options)}`;

    // If there's already a pending request for this URL and options, return it
    if (pendingRequests.has(requestKey)) {
      return pendingRequests.get(requestKey)!;
    }

    // Prevent API calls while on the auth callback page
    if (window.location.pathname === "/auth-callback") {
      return Promise.reject({
        json: {
          message: "Authentication in progress. Please wait...",
        },
        status: 401,
        headers: new Headers(),
        body: JSON.stringify({ message: "Authentication in progress" }),
      });
    }

    // Check if we're using token-based auth or client credentials
    const domains = getDomainFromStorage();
    const selectedDomain = getSelectedDomainFromStorage();
    const formattedSelectedDomain = formatDomain(selectedDomain);
    const domainConfig = domains.find(
      (d) => formatDomain(d.url) === formattedSelectedDomain,
    );

    // If using login method and auth request is in progress, delay the request
    if (
      domainConfig?.connectionMethod === "login" &&
      (authRequestInProgress || activeSessions.has(formattedSelectedDomain))
    ) {
      const delayedRequest = new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (
            !authRequestInProgress &&
            !activeSessions.has(formattedSelectedDomain)
          ) {
            clearInterval(checkInterval);
            createOrganizationHttpClient(normalizedOrgId)(url, options)
              .then(resolve)
              .catch(reject);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("Authentication timeout"));
        }, 30000);
      });

      pendingRequests.set(requestKey, delayedRequest);
      delayedRequest.finally(() => {
        pendingRequests.delete(requestKey);
      });

      return delayedRequest;
    }

    if (!domainConfig) {
      return Promise.reject({
        json: {
          message:
            "No domain configuration found. Please select a domain and configure authentication.",
        },
        status: 401,
        headers: new Headers(),
        body: JSON.stringify({ message: "No domain configuration found" }),
      });
    }

    let request;
    if (
      ["token", "client_credentials"].includes(
        domainConfig.connectionMethod || "",
      )
    ) {
      // For token/client_credentials, use organization-scoped token
      // This includes the org_id claim for accessing tenant-specific resources
      request = getOrganizationToken(domainConfig, normalizedOrgId)
        .catch((error) => {
          throw new Error(
            `Authentication failed: ${error.message}. Please configure your credentials in the domain selector.`,
          );
        })
        .then((token) => {
          const headersObj = new Headers();
          // Merge any headers passed in options
          if (options.headers) {
            const incomingHeaders =
              options.headers instanceof Headers
                ? options.headers
                : new Headers(options.headers as HeadersInit);
            incomingHeaders.forEach((value, key) => {
              headersObj.set(key, value);
            });
          }
          headersObj.set("Authorization", `Bearer ${token}`);
          const method = (options.method || "GET").toUpperCase();
          if (method === "POST" || method === "PATCH") {
            headersObj.set("content-type", "application/json");
          }
          return fetch(url, { ...options, headers: headersObj });
        })
        .then(async (response) => {
          if (response.status < 200 || response.status >= 300) {
            const text = await response.text();
            throw new Error(text || response.statusText);
          }

          const text = await response.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            json = text;
          }

          return {
            json,
            status: response.status,
            headers: response.headers,
            body: text,
          };
        })
        .catch((error) => {
          if (
            error.message === "Failed to fetch" ||
            error.name === "TypeError"
          ) {
            const urlObj = new URL(url);
            if (
              urlObj.hostname === "localhost" ||
              urlObj.hostname === "127.0.0.1"
            ) {
              const certError = new Error(
                `Unable to connect to ${urlObj.origin}. This may be due to an untrusted SSL certificate.`,
              );
              (certError as any).isCertificateError = true;
              (certError as any).serverUrl = urlObj.origin;
              throw certError;
            }
          }
          throw error;
        });
    } else {
      // For OAuth login, use an organization-specific client with isolated cache
      const orgAuth0Client = createAuth0ClientForOrg(
        selectedDomain,
        normalizedOrgId,
      );

      // Use the management API audience for cross-tenant operations
      // The org_id in the token will determine which tenant's resources are being accessed
      const audience =
        import.meta.env.VITE_AUTH0_AUDIENCE || "urn:authhero:management";

      // First, check if we have a valid session for this organization
      request = orgAuth0Client
        .getTokenSilently({
          authorizationParams: {
            audience,
            organization: normalizedOrgId,
          },
        })
        .catch(async (_error) => {
          // If silent token acquisition fails, we need to redirect to login with org
          // Get the base auth0 client to get the user's email for login hint
          const baseClient = createAuth0Client(selectedDomain);
          const user = await baseClient.getUser().catch(() => null);

          // Redirect to login with organization
          await orgAuth0Client.loginWithRedirect({
            authorizationParams: {
              organization: normalizedOrgId,
              login_hint: user?.email,
            },
            appState: {
              returnTo: window.location.pathname,
            },
          });

          // This won't be reached as loginWithRedirect redirects the page
          throw new Error(
            `Redirecting to login for organization ${normalizedOrgId}`,
          );
        })
        .then((token) => {
          const headersObj = new Headers();
          // Merge any headers passed in options
          if (options.headers) {
            const incomingHeaders =
              options.headers instanceof Headers
                ? options.headers
                : new Headers(options.headers as HeadersInit);
            incomingHeaders.forEach((value, key) => {
              headersObj.set(key, value);
            });
          }
          headersObj.set("Authorization", `Bearer ${token}`);
          const method = (options.method || "GET").toUpperCase();
          if (method === "POST" || method === "PATCH") {
            headersObj.set("content-type", "application/json");
          }
          return fetch(url, { ...options, headers: headersObj });
        })
        .then(async (response) => {
          if (response.status < 200 || response.status >= 300) {
            const text = await response.text();
            throw new Error(text || response.statusText);
          }

          const text = await response.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            json = text;
          }

          return {
            json,
            status: response.status,
            headers: response.headers,
            body: text,
          };
        })
        .catch((error) => {
          if (
            error.message === "Failed to fetch" ||
            error.name === "TypeError"
          ) {
            const urlObj = new URL(url);
            if (
              urlObj.hostname === "localhost" ||
              urlObj.hostname === "127.0.0.1"
            ) {
              const certError = new Error(
                `Unable to connect to ${urlObj.origin}. This may be due to an untrusted SSL certificate.`,
              );
              (certError as any).isCertificateError = true;
              (certError as any).serverUrl = urlObj.origin;
              throw certError;
            }
          }
          throw error;
        });
    }

    request.finally(() => {
      pendingRequests.delete(requestKey);
    });

    pendingRequests.set(requestKey, request);
    return request;
  };
};

export { authProvider, authorizedHttpClient };
