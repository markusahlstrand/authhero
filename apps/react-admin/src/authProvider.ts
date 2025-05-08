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

// For backward compatibility
const auth0 = createAuth0Client(getSelectedDomainFromCookie());
const authProvider = getAuthProvider(getSelectedDomainFromCookie());
const authorizedHttpClient = (url: string, options = {}) =>
  httpClient(auth0)(url, options);

export { authProvider, authorizedHttpClient };
