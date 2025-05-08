import { Auth0AuthProvider, httpClient } from "ra-auth-auth0";
import { Auth0Client } from "@auth0/auth0-spa-js";
import {
  getSelectedDomainFromCookie,
  getClientIdFromCookie,
} from "./utils/domainUtils";

// Create a function to get Auth0Client with the specified domain
export const createAuth0Client = (domain: string) => {
  // Check if domain includes protocol
  let fullDomain = domain;
  if (!fullDomain.startsWith("http")) {
    fullDomain = `https://${fullDomain}`;
  }

  // For external domains, we need to use different redirect settings
  // This allows us to do a complete domain redirection rather than just path-based
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}/auth-callback`;

  return new Auth0Client({
    domain, // Just the domain without protocol for Auth0 client config
    clientId: getClientIdFromCookie(domain),
    cacheLocation: "localstorage",
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      // Use the current app's URL as the redirect URI
      redirect_uri: redirectUri,
    },
  });
};

// Create a function to get the auth provider with the specified domain
export const getAuthProvider = (domain: string) => {
  const auth0 = createAuth0Client(domain);

  // Get the current app's URL for redirect
  const currentUrl = new URL(window.location.href);
  const redirectUri = `${currentUrl.protocol}//${currentUrl.host}`;

  return Auth0AuthProvider(auth0, {
    // Use the current app's URL with the auth-callback path
    loginRedirectUri: `${redirectUri}/auth-callback`,
    // Use the current app's URL for logout
    logoutRedirectUri: redirectUri,
  });
};

// Export this function to initiate login with the Auth0 client
export const initiateLogin = (domain: string): void => {
  try {
    console.log("Initiating login with domain:", domain);

    // Get client ID for this domain
    const clientId = getClientIdFromCookie(domain);
    console.log("Using client ID:", clientId);

    // Get current URL for the redirect
    const redirectUri = `${window.location.origin}/auth-callback`;

    // Handle audience if present
    const audience = import.meta.env.VITE_AUTH0_AUDIENCE || "";

    // Construct the authorization URL directly with all required parameters
    const authUrl = new URL(`https://${domain}/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid profile email");
    if (audience) {
      authUrl.searchParams.set("audience", audience);
    }
    // Add state parameter to prevent CSRF
    authUrl.searchParams.set("state", Math.random().toString(36).substring(2));

    // Force immediate redirect using window.location.replace for cleaner redirect
    console.log("Redirecting to:", authUrl.toString());
    window.location.replace(authUrl.toString());
  } catch (error) {
    console.error("Error initiating login:", error);
  }
};

// For backward compatibility
const auth0 = createAuth0Client(getSelectedDomainFromCookie());
const authProvider = getAuthProvider(getSelectedDomainFromCookie());
const authorizedHttpClient = (url: string, options = {}) =>
  httpClient(auth0)(url, options);

export { authProvider, authorizedHttpClient };
