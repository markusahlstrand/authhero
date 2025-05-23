import { Auth0AuthProvider, httpClient } from "ra-auth-auth0";
import { Auth0Client } from "@auth0/auth0-spa-js";
import {
  getSelectedDomainFromStorage,
  getClientIdFromStorage,
} from "./utils/domainUtils";

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
  let fullDomain = domain;
  if (!fullDomain.startsWith("http")) {
    fullDomain = `https://${fullDomain}`;
  }

  // For external domains, we need to use different redirect settings
  // This allows us to do a complete domain redirection rather than just path-based
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}/auth-callback`;

  const auth0Client = new Auth0Client({
    domain, // Just the domain without protocol for Auth0 client config
    clientId: getClientIdFromStorage(domain),
    cacheLocation: "localstorage",
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      // Use the current app's URL as the redirect URI
      redirect_uri: redirectUri,
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

// Create a singleton auth0 client for the selected domain
const auth0 = createAuth0Client(getSelectedDomainFromStorage());
const authProvider = getAuthProvider(getSelectedDomainFromStorage());

// Create a debounced http client to prevent parallel token requests
let pendingRequests = new Map<string, Promise<any>>();
const authorizedHttpClient = (url: string, options = {}) => {
  const requestKey = `${url}-${JSON.stringify(options)}`;

  // If there's already a pending request for this URL and options, return it
  if (pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey)!;
  }

  // Otherwise, create a new request and cache it
  const request = httpClient(auth0)(url, options).finally(() => {
    // Remove from pending requests when done
    pendingRequests.delete(requestKey);
  });

  // Cache the request
  pendingRequests.set(requestKey, request);
  return request;
};

export { authProvider, authorizedHttpClient };
