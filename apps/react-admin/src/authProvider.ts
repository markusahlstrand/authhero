import { Auth0AuthProvider, httpClient } from "ra-auth-auth0";
import { Auth0Client } from "@auth0/auth0-spa-js";
import {
  getSelectedDomainFromStorage,
  getClientIdFromStorage,
  getDomainFromStorage,
  buildUrlWithProtocol,
} from "./utils/domainUtils";
import getToken from "./utils/tokenUtils";

// Track auth requests globally
let authRequestInProgress = false;
let lastAuthRequestTime = 0;
const AUTH_REQUEST_DEBOUNCE_MS = 1000; // Debounce time between auth requests

// Store active sessions by domain
const activeSessions = new Map<string, boolean>();

// Cache for auth0 clients
const auth0ClientCache = new Map<string, Auth0Client>();

// Create a function to get Auth0Client with the specified domain
export const createAuth0Client = (domain: string) => {
  // Check cache first to avoid creating multiple clients for the same domain
  if (auth0ClientCache.has(domain)) {
    return auth0ClientCache.get(domain)!;
  }

  // Check if domain includes protocol
  const fullDomain = buildUrlWithProtocol(domain);

  // For external domains, we need to use different redirect settings
  // This allows us to do a complete domain redirection rather than just path-based
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}/auth-callback`;

  const auth0Client = new Auth0Client({
    domain: fullDomain,
    clientId: getClientIdFromStorage(domain),
    cacheLocation: "localstorage",
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      // Use the current app's URL as the redirect URI
      redirect_uri: redirectUri,
      scope: "openid profile email auth:read auth:write",
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

// Create a function to get the auth provider with the specified domain
export const getAuthProvider = (
  domain: string,
  onAuthComplete?: () => void,
) => {
  // Get domain config to check connection method
  const domains = getDomainFromStorage();
  const domainConfig = domains.find((d) => d.url === domain);

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
        // No need to do anything for token auth
        return Promise.resolve();
      },
      checkError: async (error: any) => {
        if (error.status === 401) {
          return Promise.reject();
        }
        return Promise.resolve();
      },
      checkAuth: async () => {
        // Token auth is always authenticated
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
        const result = await baseAuthProvider.logout(params);
        if (onAuthComplete) onAuthComplete();
        return result;
      } catch (error) {
        if (onAuthComplete) onAuthComplete();
        throw error;
      }
    },
    checkAuth: async (params: any) => {
      try {
        const result = await baseAuthProvider.checkAuth(params);
        return result;
      } catch (error) {
        if (onAuthComplete) onAuthComplete();
        activeSessions.delete(domain);
        throw error;
      }
    },
  };
};

// Create a singleton auth0 client and auth provider for the selected domain
const selectedDomain = getSelectedDomainFromStorage();
const auth0 = createAuth0Client(selectedDomain);
const authProvider = getAuthProvider(selectedDomain);

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

  // Check if we're using token-based auth or client credentials
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const domainConfig = domains.find((d) => d.url === selectedDomain);

  let request;
  if (
    domainConfig &&
    ["token", "client_credentials"].includes(
      domainConfig.connectionMethod || "",
    )
  ) {
    // For token auth or client credentials, use the getToken helper
    request = getToken(domainConfig)
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
            // Use history.pushState for a soft navigation instead of a hard redirect
            window.history.pushState({}, "", "/auth0");
            // Dispatch a navigation event so the app can respond to the URL change
            window.dispatchEvent(new PopStateEvent("popstate"));
            // Return a promise that never resolves, as we're redirecting
            return new Promise(() => {});
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
      });
  } else {
    // For Auth0, use the httpClient as before
    request = httpClient(auth0)(url, options);
  }

  // Handle cleanup when request is done
  request.finally(() => {
    pendingRequests.delete(requestKey);
  });

  // Cache the request
  pendingRequests.set(requestKey, request);
  return request;
};

export { authProvider, authorizedHttpClient };
