import type {
  ProxyDataAdapter,
  ResolvedHost,
  ResolveHostOptions,
} from "../adapter";
import type { ProxyRoutesAdapter } from "../adapter";
import { PROXY_RESOLVE_HOST_SCOPE } from "../constants";
import { anySignal, TimeoutError } from "../data-plane/timeout";

export interface HttpProxyAdapterOptions {
  // Base URL of the AuthHero control plane, without trailing slash.
  // e.g. `https://auth.example.com`.
  baseUrl: string;
  // Client credentials issued for the proxy. The token endpoint is assumed
  // to live at `${baseUrl}/oauth/token` and the issued token must carry the
  // `proxy:resolve_host` scope (`PROXY_RESOLVE_HOST_SCOPE`).
  clientId: string;
  clientSecret: string;
  // Optional audience for the client credentials grant. Defaults to
  // `${baseUrl}/api/v2/`.
  audience?: string;
  // Override the scope requested when minting the bearer. Defaults to
  // `PROXY_RESOLVE_HOST_SCOPE` — the value the control-plane verifier
  // requires.
  scope?: string;
  // Override the resolve-host endpoint. Defaults to
  // `/api/v2/proxy/control-plane/hosts/:host`.
  resolveHostPath?: string;
  // Token cache: how many seconds to refresh before expiry. Defaults to 60.
  tokenRefreshSkewSeconds?: number;
  // Per-request timeout (ms) applied to both the token fetch and the
  // resolveHost fetch, covering the response body and not just the headers.
  // Defaults to 2500. Kept well below the router's outer
  // `resolveHostTimeoutMs` (10s) so two sequential fetches (token +
  // resolveHost) still fit under the outer ceiling, and so this inner
  // abort surfaces a structured adapter error instead of being shadowed
  // by the outer race timeout.
  timeoutMs?: number;
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
  const scope = options.scope ?? PROXY_RESOLVE_HOST_SCOPE;
  const skewSeconds = options.tokenRefreshSkewSeconds ?? 60;
  const timeoutMs = options.timeoutMs ?? 2500;

  // The deadline covers the whole operation, body read included — aborting the
  // fetch alone leaves a stalled body to hang forever, because the timer is
  // already cleared by the time the caller reads it. `parent` is the caller's
  // signal: when its deadline fires first, the fetch is aborted with it.
  function withTimeout<T>(
    parent: AbortSignal | undefined,
    op: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const signal = anySignal([parent, controller.signal]) ?? controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(timeoutMs, "control plane"));
      }, timeoutMs);
    });
    return Promise.race([op(signal), deadline]).finally(() =>
      clearTimeout(timer),
    );
  }

  // Only the token lives at adapter scope, never a pending fetch. A promise
  // started by one request is tied to that request's I/O context: if that
  // request is cancelled the promise may never settle, and every later request
  // in the isolate that awaited it hangs with it — for the life of the isolate,
  // since nothing but the promise settling ever cleared the pointer. Each
  // request mints on its own instead; the few concurrent token fetches when one
  // expires are cheap next to that.
  let token: { value: string; expires_at: number } | null = null;

  async function fetchToken(parent?: AbortSignal): Promise<string> {
    const body = await withTimeout(parent, async (signal) => {
      const res = await fetchFn(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: options.clientId,
          client_secret: options.clientSecret,
          audience,
          scope,
        }),
        signal,
      });
      if (!res.ok) {
        throw new Error(
          `Proxy adapter token request failed: ${res.status} ${await res.text().catch(() => "")}`,
        );
      }
      return (await res.json()) as TokenResponse;
    });
    const expiresIn = body.expires_in ?? 3600;
    token = {
      value: body.access_token,
      expires_at: Date.now() + (expiresIn - skewSeconds) * 1000,
    };
    return body.access_token;
  }

  async function getToken(parent?: AbortSignal): Promise<string> {
    if (token && token.expires_at > Date.now()) return token.value;
    return fetchToken(parent);
  }

  return {
    proxyRoutes: readOnlyProxyRoutes(),
    async resolveHost(
      host: string,
      resolveOptions?: ResolveHostOptions,
    ): Promise<ResolvedHost | null> {
      const parent = resolveOptions?.signal;
      const accessToken = await getToken(parent);
      const url = `${baseUrl}${resolvePath}${encodeURIComponent(host.toLowerCase())}`;
      return withTimeout(parent, async (signal) => {
        const res = await fetchFn(url, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (res.status === 404) return null;
        if (!res.ok) {
          throw new Error(
            `Proxy adapter resolveHost failed: ${res.status} ${await res.text().catch(() => "")}`,
          );
        }
        return (await res.json()) as ResolvedHost;
      });
    },
  };
}
