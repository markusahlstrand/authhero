// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://localhost:3000/admin/tenants"}
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Auth0Client, GenericError, TimeoutError } from "@auth0/auth0-spa-js";
import getToken, {
  clearOrganizationTokenCache,
  getOrgAccessToken,
  getOrganizationToken,
  recoverFromTokenError,
} from "./tokenUtils";
import type { DomainConfig } from "./domainUtils";

// Keep the real error classes (tokenUtils relies on `instanceof GenericError`)
// but swap the client for one whose methods are plain mocks.
vi.mock("@auth0/auth0-spa-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@auth0/auth0-spa-js")>();
  class MockAuth0Client {
    getTokenSilently = vi.fn();
    getUser = vi.fn();
    logout = vi.fn();
    loginWithRedirect = vi.fn();
  }
  return { ...actual, Auth0Client: MockAuth0Client };
});

const DOMAIN = "auth.example.com";
const AUDIENCE = "urn:authhero:management";

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Unsigned JWT — tokenUtils only decodes the payload.
function makeJwt(claims: Record<string, unknown>, ttlSeconds = 3600): string {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...claims,
  };
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url(payload)}.`;
}

function createClient() {
  const client = new Auth0Client({ domain: DOMAIN, clientId: "admin-ui" });
  client.getUser = vi.fn().mockResolvedValue({ email: "admin@example.com" });
  client.logout = vi.fn().mockResolvedValue(undefined);
  client.loginWithRedirect = vi.fn().mockResolvedValue(undefined);
  return client;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setRuntimeConfig(audience = "") {
  window.__AUTHHERO_ADMIN_CONFIG__ = {
    domain: "",
    clientId: "",
    apiUrl: "",
    audience,
  };
}

const loginConfig: DomainConfig = {
  url: `https://${DOMAIN}`,
  connectionMethod: "login",
  clientId: "admin-ui",
};

const clientCredentialsConfig: DomainConfig = {
  url: DOMAIN,
  connectionMethod: "client_credentials",
  clientId: "cc-client",
  clientSecret: "cc-secret",
};

beforeEach(() => {
  clearOrganizationTokenCache();
  setRuntimeConfig();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getOrgAccessToken", () => {
  it("requests an org-scoped token with the SDK cache bypassed", async () => {
    const client = createClient();
    const token = makeJwt({ org_id: "acme" });
    vi.mocked(client.getTokenSilently).mockResolvedValue(token);

    await expect(
      getOrgAccessToken(client, "ACME", AUDIENCE, DOMAIN),
    ).resolves.toBe(token);
    expect(client.getTokenSilently).toHaveBeenCalledWith({
      cacheMode: "off",
      authorizationParams: { audience: AUDIENCE, organization: "acme" },
    });
  });

  it("serves a cached token until it is close to expiry", async () => {
    const client = createClient();
    const token = makeJwt({ org_id: "acme" });
    vi.mocked(client.getTokenSilently).mockResolvedValue(token);

    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    await expect(
      getOrgAccessToken(client, "ACME", AUDIENCE, DOMAIN),
    ).resolves.toBe(token);

    expect(client.getTokenSilently).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cached token is within a minute of expiry", async () => {
    const client = createClient();
    const expiring = makeJwt({ org_id: "acme" }, 30);
    const fresh = makeJwt({ org_id: "acme", fresh: true });
    vi.mocked(client.getTokenSilently)
      .mockResolvedValueOnce(expiring)
      .mockResolvedValueOnce(fresh);

    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(expiring);
    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(fresh);

    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
  });

  it("refetches after the cached token has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const client = createClient();
      const first = makeJwt({ org_id: "acme" }, 3600);
      vi.mocked(client.getTokenSilently).mockResolvedValueOnce(first);
      await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);

      vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
      const second = makeJwt({ org_id: "acme" }, 3600);
      vi.mocked(client.getTokenSilently).mockResolvedValueOnce(second);

      await expect(
        getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
      ).resolves.toBe(second);
      expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps separate cache entries per org, audience and domain", async () => {
    const client = createClient();
    vi.mocked(client.getTokenSilently).mockImplementation(async (options) =>
      makeJwt({ org_id: options?.authorizationParams?.organization }),
    );

    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    await getOrgAccessToken(client, "globex", AUDIENCE, DOMAIN);
    await getOrgAccessToken(client, "acme", "urn:other", DOMAIN);
    await getOrgAccessToken(client, "acme", AUDIENCE, "other.example.com");

    expect(client.getTokenSilently).toHaveBeenCalledTimes(4);
  });

  it("shares one exchange between parallel callers on a cold cache", async () => {
    const client = createClient();
    const token = makeJwt({ org_id: "acme" });
    const pending = deferred<string>();
    vi.mocked(client.getTokenSilently).mockReturnValue(pending.promise);

    const calls = [
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
      getOrgAccessToken(client, "ACME", AUDIENCE, DOMAIN),
    ];
    pending.resolve(token);

    await expect(Promise.all(calls)).resolves.toEqual([token, token, token]);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(1);
  });

  it("drops the entry when the exchange fails so the next call retries", async () => {
    const client = createClient();
    const token = makeJwt({ org_id: "acme" });
    vi.mocked(client.getTokenSilently)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(token);

    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).rejects.toThrow("network down");
    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(token);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
  });

  it("accepts a cached token that matches on org_name (the slug)", async () => {
    const client = createClient();
    const token = makeJwt({ org_id: "org_123", org_name: "acme" });
    vi.mocked(client.getTokenSilently).mockResolvedValue(token);

    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(token);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a different org_id", { org_id: "globex" }],
    ["a different org_name", { org_id: "org_999", org_name: "globex" }],
    ["no org at all", {}],
  ])("never serves a cached token carrying %s", async (_label, wrongClaims) => {
    const client = createClient();
    const wrong = makeJwt(wrongClaims);
    const right = makeJwt({ org_id: "acme" });
    vi.mocked(client.getTokenSilently)
      .mockResolvedValueOnce(wrong)
      .mockResolvedValueOnce(right);

    // The first exchange's result is returned as-is; the guard only runs
    // when an entry is read back from the cache.
    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(wrong);
    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(right);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);

    await expect(
      getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN),
    ).resolves.toBe(right);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
  });
});

describe("clearOrganizationTokenCache", () => {
  it("forces a fresh exchange for both org and non-org tokens", async () => {
    const client = createClient();
    vi.mocked(client.getTokenSilently).mockImplementation(async (options) => {
      const org = options?.authorizationParams?.organization;
      return makeJwt(org ? { org_id: org } : {});
    });

    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    await getToken(loginConfig, client);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);

    clearOrganizationTokenCache();

    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    await getToken(loginConfig, client);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(4);
  });
});

describe("recoverFromTokenError", () => {
  it("rethrows errors that are not GenericErrors untouched", async () => {
    const client = createClient();
    const error = new TypeError("Failed to fetch");

    await expect(recoverFromTokenError(client, error)).rejects.toBe(error);
    expect(client.logout).not.toHaveBeenCalled();
    expect(client.loginWithRedirect).not.toHaveBeenCalled();
  });

  it.each(["timeout", "access_denied", "server_error"])(
    "rethrows a GenericError with the non-reauth code %s untouched",
    async (code) => {
      const client = createClient();
      const error = new GenericError(code, "nope");

      await expect(recoverFromTokenError(client, error)).rejects.toBe(error);
      expect(client.logout).not.toHaveBeenCalled();
      expect(client.loginWithRedirect).not.toHaveBeenCalled();
    },
  );

  it("rethrows the SDK TimeoutError untouched", async () => {
    const client = createClient();
    const error = new TimeoutError();

    await expect(recoverFromTokenError(client, error)).rejects.toBe(error);
    expect(client.loginWithRedirect).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_grant",
    "missing_refresh_token",
    "login_required",
    "interaction_required",
    "consent_required",
    "mfa_required",
  ])("forces an interactive login for %s", async (code) => {
    const client = createClient();

    await expect(
      recoverFromTokenError(client, new GenericError(code, "dead")),
    ).rejects.toThrow("Redirecting to login");

    expect(client.logout).toHaveBeenCalledWith({ openUrl: false });
    expect(client.loginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: { login_hint: "admin@example.com" },
      appState: { returnTo: "/admin/tenants" },
    });
  });

  it("carries the organization into the re-auth redirect", async () => {
    const client = createClient();

    await expect(
      recoverFromTokenError(
        client,
        new GenericError("invalid_grant", "revoked"),
        "acme",
      ),
    ).rejects.toThrow("Redirecting to login for organization acme");

    expect(client.loginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: {
        organization: "acme",
        login_hint: "admin@example.com",
      },
      appState: { returnTo: "/admin/tenants" },
    });
  });

  it("still redirects when the user profile cannot be read", async () => {
    const client = createClient();
    vi.mocked(client.getUser).mockRejectedValue(new Error("no user"));

    await expect(
      recoverFromTokenError(client, new GenericError("login_required", "")),
    ).rejects.toThrow("Redirecting to login");
    expect(client.loginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: { login_hint: undefined },
      appState: { returnTo: "/admin/tenants" },
    });
  });

  it("clears the token caches before redirecting", async () => {
    const client = createClient();
    vi.mocked(client.getTokenSilently).mockImplementation(async () =>
      makeJwt({ org_id: "acme" }),
    );
    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);

    await expect(
      recoverFromTokenError(client, new GenericError("invalid_grant", "")),
    ).rejects.toThrow();

    await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
  });
});

describe("getOrganizationToken", () => {
  it("fetches a client-credentials token scoped to the lowercased org", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "cc-token" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getOrganizationToken(clientCredentialsConfig, "ACME"),
    ).resolves.toBe("cc-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://proxy.authhe.ro/oauth/token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Auth0-Domain": DOMAIN,
    });
    expect(JSON.parse(init.body)).toMatchObject({
      grant_type: "client_credentials",
      client_id: "cc-client",
      client_secret: "cc-secret",
      audience: "urn:authhero:management",
      organization: "acme",
    });
  });

  it("surfaces a failed client-credentials exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    );

    await expect(
      getOrganizationToken(clientCredentialsConfig, "acme"),
    ).rejects.toThrow("Failed to fetch token with client credentials");
  });

  it("rejects the static token method", async () => {
    await expect(
      getOrganizationToken(
        { url: DOMAIN, connectionMethod: "token", token: "static" },
        "acme",
      ),
    ).rejects.toThrow("Token-based auth cannot provide organization-scoped");
  });

  it("rejects the login method (handled via getOrgAccessToken instead)", async () => {
    await expect(getOrganizationToken(loginConfig, "acme")).rejects.toThrow(
      "Organization-scoped tokens require client_credentials or login",
    );
  });

  it("rejects client_credentials without a secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getOrganizationToken(
        { url: DOMAIN, connectionMethod: "client_credentials", clientId: "x" },
        "acme",
      ),
    ).rejects.toThrow("Organization-scoped tokens require");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getToken", () => {
  it("returns the static token for the token method", async () => {
    await expect(
      getToken({ url: DOMAIN, connectionMethod: "token", token: "static" }),
    ).resolves.toBe("static");
  });

  it("fetches a client-credentials token without an organization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "cc-token" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getToken(clientCredentialsConfig)).resolves.toBe("cc-token");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).not.toHaveProperty("organization");
  });

  it("gets a non-org token via the SDK for the login method", async () => {
    const client = createClient();
    const token = makeJwt({});
    vi.mocked(client.getTokenSilently).mockResolvedValue(token);

    await expect(getToken(loginConfig, client)).resolves.toBe(token);
    await expect(getToken(loginConfig, client)).resolves.toBe(token);

    expect(client.getTokenSilently).toHaveBeenCalledTimes(1);
    expect(client.getTokenSilently).toHaveBeenCalledWith({
      cacheMode: "off",
      authorizationParams: { audience: AUDIENCE, organization: undefined },
    });
  });

  it("uses the configured audience for the login method", async () => {
    setRuntimeConfig("urn:custom:api");
    const client = createClient();
    vi.mocked(client.getTokenSilently).mockResolvedValue(makeJwt({}));

    await getToken(loginConfig, client);

    expect(client.getTokenSilently).toHaveBeenCalledWith({
      cacheMode: "off",
      authorizationParams: {
        audience: "urn:custom:api",
        organization: undefined,
      },
    });
  });

  it("shares one exchange between parallel non-org callers", async () => {
    const client = createClient();
    const token = makeJwt({});
    const pending = deferred<string>();
    vi.mocked(client.getTokenSilently).mockReturnValue(pending.promise);

    const calls = [
      getToken(loginConfig, client),
      getToken(loginConfig, client),
    ];
    pending.resolve(token);

    await expect(Promise.all(calls)).resolves.toEqual([token, token]);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(1);
  });

  it("never serves a cached org-scoped token as the non-org token", async () => {
    const client = createClient();
    const orgScoped = makeJwt({ org_id: "acme" });
    const plain = makeJwt({});
    vi.mocked(client.getTokenSilently)
      .mockResolvedValueOnce(orgScoped)
      .mockResolvedValueOnce(plain);

    await expect(getToken(loginConfig, client)).resolves.toBe(orgScoped);
    await expect(getToken(loginConfig, client)).resolves.toBe(plain);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
  });

  it("does not share cache entries between org and non-org tokens", async () => {
    const client = createClient();
    vi.mocked(client.getTokenSilently).mockImplementation(async (options) => {
      const org = options?.authorizationParams?.organization;
      return makeJwt(org ? { org_id: org } : {});
    });

    const orgToken = await getOrgAccessToken(client, "acme", AUDIENCE, DOMAIN);
    const plainToken = await getToken(loginConfig, client);

    expect(plainToken).not.toBe(orgToken);
    expect(client.getTokenSilently).toHaveBeenCalledTimes(2);
  });

  it("forces re-auth when the refresh token is rejected", async () => {
    const client = createClient();
    vi.mocked(client.getTokenSilently).mockRejectedValue(
      new GenericError("invalid_grant", "Unknown or invalid refresh token."),
    );

    await expect(getToken(loginConfig, client)).rejects.toThrow(
      "Redirecting to login",
    );
    expect(client.logout).toHaveBeenCalledWith({ openUrl: false });
    expect(client.loginWithRedirect).toHaveBeenCalledTimes(1);
  });

  it("rethrows transient failures without logging out", async () => {
    const client = createClient();
    const error = new TypeError("Failed to fetch");
    vi.mocked(client.getTokenSilently).mockRejectedValue(error);

    await expect(getToken(loginConfig, client)).rejects.toBe(error);
    expect(client.logout).not.toHaveBeenCalled();
  });

  it("throws when the login method has no client", async () => {
    await expect(getToken(loginConfig)).rejects.toThrow(
      "No authentication method available",
    );
  });

  it("throws when the token method has no token", async () => {
    await expect(
      getToken({ url: DOMAIN, connectionMethod: "token" }),
    ).rejects.toThrow("No authentication method available");
  });
});
