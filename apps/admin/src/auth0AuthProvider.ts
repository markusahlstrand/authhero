import { type AuthProvider, PreviousLocationStorageKey } from "ra-core";
import { Auth0Client } from "@auth0/auth0-spa-js";

type Auth0AuthProviderOptions = {
  loginRedirectUri?: string;
  logoutRedirectUri?: string;
  redirectOnCheckAuth?: boolean;
};

let handleCallbackPromise: Promise<void> | null = null;

export const Auth0AuthProvider = (
  client: Auth0Client,
  {
    loginRedirectUri,
    logoutRedirectUri,
    redirectOnCheckAuth = true,
  }: Auth0AuthProviderOptions = { redirectOnCheckAuth: true },
): AuthProvider => ({
  async login() {
    await client.loginWithRedirect({
      authorizationParams: {
        redirect_uri:
          loginRedirectUri ?? `${window.location.origin}/auth-callback`,
      },
    });
  },
  async logout() {
    await client.logout({
      logoutParams: {
        returnTo: logoutRedirectUri || window.location.origin,
      },
    });
    return false;
  },
  async checkError({ status }: { status?: number }) {
    if (status === 401 || status === 403) {
      throw new Error("Unauthorized");
    }
  },
  async checkAuth() {
    const isAuthenticated = await client.isAuthenticated();
    if (isAuthenticated) {
      return;
    }

    if (redirectOnCheckAuth) {
      localStorage.setItem(PreviousLocationStorageKey, window.location.href);
      return client.loginWithRedirect({
        authorizationParams: {
          redirect_uri:
            loginRedirectUri ?? `${window.location.origin}/auth-callback`,
        },
      });
    }
    throw new Error("Unauthorized");
  },
  async getPermissions() {
    if (!(await client.isAuthenticated())) {
      return;
    }
    const claims = await client.getIdTokenClaims();
    if (!claims) return;
    const roleProperty = Object.keys(claims).find((key) =>
      key.includes("role"),
    );
    return roleProperty ? claims[roleProperty] : undefined;
  },
  async getIdentity() {
    if (await client.isAuthenticated()) {
      const user = await client.getUser();
      return {
        id: user?.email ?? "",
        fullName: user?.name,
        avatar: user?.picture,
      };
    }
    throw new Error("Failed to get identity.");
  },
  async handleCallback() {
    if (!handleCallbackPromise) {
      handleCallbackPromise = new Promise((resolve, reject) => {
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
          client
            .handleRedirectCallback()
            .then(() => resolve())
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : String(error);
              reject({ redirectTo: false, message });
            });
          return;
        }
        reject({ message: "Failed to handle login callback." });
      });
    }
    return handleCallbackPromise;
  },
});
