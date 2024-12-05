import { Auth0AuthProvider, httpClient } from "ra-auth-auth0";
import { Auth0Client } from "@auth0/auth0-spa-js";

const getUrlByEnvironment = () => {
  // eslint-disable-next-line no-undef
  const VITE_VERCEL_URL = process.env.VITE_VERCEL_URL;

  if (VITE_VERCEL_URL) {
    return `https://${VITE_VERCEL_URL}`;
  }

  // rename this? and nuke VITE_LOGIN_REDIRECT_URL env var
  return import.meta.env.VITE_LOGOUT_REDIRECT_URL;
};

export const baseRedirectUri = getUrlByEnvironment();

const auth0 = new Auth0Client({
  domain: import.meta.env.VITE_AUTH0_DOMAIN,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  cacheLocation: "localstorage",
  authorizationParams: {
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
  },
});

const authProvider = Auth0AuthProvider(auth0, {
  loginRedirectUri: `${getUrlByEnvironment()}/auth-callback`,
  logoutRedirectUri: getUrlByEnvironment(),
});

const authorizedHttpClient = httpClient(auth0);

export { authProvider, authorizedHttpClient };
