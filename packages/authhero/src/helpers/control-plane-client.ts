import { decode } from "hono/jwt";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SKEW_SECONDS = 60;

/**
 * Mints a bearer token for a tenant against the control plane. On a tenant
 * shard this is `createServiceTokenCore` bound to the shard's own tenants/keys
 * adapters — the control plane verifies it against the shard's published JWKS,
 * so no shared client secret is involved.
 */
export type GetControlPlaneToken = (
  tenantId: string,
  scope: string,
) => Promise<string>;

export interface ControlPlaneClientOptions {
  /** Base URL of the control-plane authhero instance, no trailing slash required. */
  baseUrl: string;
  getServiceToken: GetControlPlaneToken;
  /** Per-request timeout (default: 5s). */
  timeoutMs?: number;
  /** Refresh a cached token this many seconds before it expires (default: 60). */
  tokenRefreshSkewSeconds?: number;
  /** Override for tests, or to route over a Cloudflare service binding. */
  fetchImpl?: typeof fetch;
}

export interface ControlPlaneRequest {
  tenantId: string;
  scope: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path below the base URL, e.g. `/api/v2/proxy/control-plane/custom-domains`. */
  path: string;
  body?: unknown;
}

export interface ControlPlaneResponse {
  status: number;
  /** Parsed JSON body, or null for empty/non-JSON responses. */
  data: unknown;
}

export interface ControlPlaneClient {
  /**
   * Perform an authed request. Returns the status and parsed body for ANY HTTP
   * response — including 4xx/5xx — so callers can map status to domain
   * semantics (409 → conflict, 404 → null). Throws only when the request never
   * produced a response (network error, timeout, token minting failure).
   */
  request(req: ControlPlaneRequest): Promise<ControlPlaneResponse>;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * Read the `exp` claim so the cache expires with the token itself rather than
 * a guessed TTL. Falls back to a short TTL when the token has no usable `exp`.
 */
function expiryFromToken(token: string, skewSeconds: number): number {
  try {
    const { payload } = decode(token);
    const exp = (payload as { exp?: unknown }).exp;
    if (typeof exp === "number") {
      return exp * 1000 - skewSeconds * 1000;
    }
  } catch {
    // fall through
  }
  return Date.now() + 60_000;
}

/**
 * Authed transport to the control plane with an in-memory, per-(tenant, scope)
 * token cache and single-flight minting. Shared by every control-plane-backed
 * adapter so the token handling exists once.
 */
export function createControlPlaneClient(
  options: ControlPlaneClientOptions,
): ControlPlaneClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const skewSeconds = options.tokenRefreshSkewSeconds ?? DEFAULT_SKEW_SECONDS;

  const tokens = new Map<string, CachedToken>();
  const pending = new Map<string, Promise<string>>();

  /**
   * Drop every expired entry. A long-lived client serving many (tenant, scope)
   * pairs would otherwise accumulate entries that are never looked up again.
   * Runs only on the mint path (a cache miss), so it is not on the hot path.
   */
  function evictExpired(now: number): void {
    for (const [k, t] of tokens) {
      if (t.expiresAt <= now) tokens.delete(k);
    }
  }

  async function getToken(
    tenantId: string,
    scope: string,
    forceRefresh = false,
  ): Promise<string> {
    const key = `${tenantId}\n${scope}`;
    if (forceRefresh) {
      tokens.delete(key);
    } else {
      const cached = tokens.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
    }

    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    evictExpired(Date.now());

    const promise = options
      .getServiceToken(tenantId, scope)
      .then((value) => {
        tokens.set(key, {
          value,
          expiresAt: expiryFromToken(value, skewSeconds),
        });
        return value;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, promise);
    return promise;
  }

  async function send(
    req: ControlPlaneRequest,
    token: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${baseUrl}${req.path}`, {
        method: req.method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(req.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async request(req: ControlPlaneRequest): Promise<ControlPlaneResponse> {
      let token = await getToken(req.tenantId, req.scope);
      let response = await send(req, token);

      // A cached token can be rejected if the shard rotated its signing key
      // mid-flight. Mint once more before giving up so a key rotation doesn't
      // surface as a user-visible 401.
      if (response.status === 401) {
        token = await getToken(req.tenantId, req.scope, true);
        response = await send(req, token);
      }

      const text = await response.text().catch(() => "");
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      return { status: response.status, data };
    },
  };
}
