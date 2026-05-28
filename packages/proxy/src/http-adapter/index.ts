import type { ProxyDataAdapter, ResolvedHost } from "../adapter";
import type { ProxyRoutesAdapter } from "../adapter";

export interface HttpProxyAdapterOptions {
  // Base URL of the AuthHero control plane, without trailing slash.
  // e.g. `https://auth.example.com`.
  baseUrl: string;
  // Client credentials issued for the proxy. The token endpoint is assumed
  // to live at `${baseUrl}/oauth/token` and to issue a token with the
  // `proxy:resolve_host` scope.
  clientId: string;
  clientSecret: string;
  // Optional audience for the client credentials grant. Defaults to
  // `${baseUrl}/api/v2/`.
  audience?: string;
  // Override the resolve-host endpoint. Defaults to
  // `/api/v2/proxy/control-plane/hosts/:host`.
  resolveHostPath?: string;
  // Token cache: how many seconds to refresh before expiry. Defaults to 60.
  tokenRefreshSkewSeconds?: number;
  // Optional fetch override (handy for tests).
  fetch?: typeof fetch;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

function readOnlyProxyRoutes(): ProxyRoutesAdapter {
  const fail = (): never => {
    throw new Error(
      "HTTP proxy adapter does not expose write access to proxy_routes; mutate via the control-plane management API",
    );
  };
  return {
    async create() {
      return fail();
    },
    async update() {
      return fail();
    },
    async remove() {
      return fail();
    },
    async get() {
      throw new Error(
        "HTTP proxy adapter does not expose per-route reads; use resolveHost",
      );
    },
    async list() {
      throw new Error(
        "HTTP proxy adapter does not expose per-route reads; use resolveHost",
      );
    },
  };
}

/**
 * Build a `ProxyDataAdapter` that reads from the AuthHero control plane over
 * HTTP. Intended for a proxy deployment that does not share a database with
 * the control plane.
 *
 * Authentication is a single `client_credentials` grant against the control
 * plane. The token is cached in-memory and refreshed before expiry. The
 * privileged `resolveHost` endpoint must be served by the control plane and
 * requires the `proxy:resolve_host` scope.
 */
export function createHttpProxyAdapter(
  options: HttpProxyAdapterOptions,
): ProxyDataAdapter {
  const fetchFn = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const resolvePath =
    options.resolveHostPath ?? "/api/v2/proxy/control-plane/hosts/";
  const audience = options.audience ?? `${baseUrl}/api/v2/`;
  const skewSeconds = options.tokenRefreshSkewSeconds ?? 60;

  let token: { value: string; expires_at: number } | null = null;
  let pending: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const res = await fetchFn(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: options.clientId,
        client_secret: options.clientSecret,
        audience,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Proxy adapter token request failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
    const body = (await res.json()) as TokenResponse;
    const expiresIn = body.expires_in ?? 3600;
    token = {
      value: body.access_token,
      expires_at: Date.now() + (expiresIn - skewSeconds) * 1000,
    };
    return body.access_token;
  }

  async function getToken(): Promise<string> {
    if (token && token.expires_at > Date.now()) return token.value;
    if (pending) return pending;
    pending = fetchToken().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    proxyRoutes: readOnlyProxyRoutes(),
    async resolveHost(host: string): Promise<ResolvedHost | null> {
      const accessToken = await getToken();
      const url = `${baseUrl}${resolvePath}${encodeURIComponent(host.toLowerCase())}`;
      const res = await fetchFn(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(
          `Proxy adapter resolveHost failed: ${res.status} ${await res.text().catch(() => "")}`,
        );
      }
      return (await res.json()) as ResolvedHost;
    },
  };
}
