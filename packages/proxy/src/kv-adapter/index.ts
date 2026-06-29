import type { ProxyDataAdapter, ResolvedHost } from "../adapter";
import type { ProxyRoutesAdapter } from "../adapter";
import { withRaceTimeout } from "../data-plane/timeout";

/**
 * Minimal structural view of a Cloudflare KV namespace's read surface. Declared
 * locally so `@authhero/proxy` stays free of a hard `@cloudflare/workers-types`
 * dependency — a real `KVNamespace` binding is structurally assignable to this.
 */
export interface KvNamespaceReader {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
}

/**
 * Minimal structural view of a Cloudflare KV namespace's write surface, consumed
 * by the control-plane publisher. A real `KVNamespace` is assignable to this.
 */
export interface KvNamespaceWriter {
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const DEFAULT_KV_HOST_KEY_PREFIX = "authhero-proxy-host:";

/**
 * Build the KV key for a host. Shared by the proxy reader
 * (`createKvProxyAdapter`) and the control-plane publisher so both agree on the
 * exact key format. Hosts are lowercased for case-insensitive lookups.
 */
export function buildKvHostKey(keyPrefix: string, host: string): string {
  return `${keyPrefix}${host.toLowerCase()}`;
}

export interface KvProxyAdapterOptions {
  // KV namespace binding the resolved host blobs are read from.
  kv: KvNamespaceReader;
  // Key prefix used to scope entries within the namespace. Must match the
  // prefix the publisher writes with. Defaults to `authhero-proxy-host:`.
  keyPrefix?: string;
  // Optional timeout (ms) on the `KV.get` call. When it fires, the lookup
  // rejects so the surrounding cache layer can fall through to its next
  // upstream (e.g. the HTTP control-plane adapter). Defaults to no timeout.
  timeoutMs?: number;
}

function readOnlyProxyRoutes(): ProxyRoutesAdapter {
  const fail = (): never => {
    throw new Error(
      "KV proxy adapter does not expose write access to proxy_routes; mutate via the control-plane management API",
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
        "KV proxy adapter does not expose per-route reads; use resolveHost",
      );
    },
    async list() {
      throw new Error(
        "KV proxy adapter does not expose per-route reads; use resolveHost",
      );
    },
  };
}

/**
 * Build a `ProxyDataAdapter` that resolves hosts from a Cloudflare KV namespace.
 * The control plane publishes the full `ResolvedHost` blob per host into KV; the
 * proxy reads it with a single, unauthenticated, edge-local `KV.get` — faster
 * and more reliable on cold reads than the two-hop HTTP control-plane adapter.
 *
 * Intended to sit in the `upstream` seam of `createCacheAdapterHostCache` as the
 * durable-edge layer. A null from KV means "not found"; callers can keep the
 * HTTP adapter as a miss / `stale-if-error` fallback during cutover.
 */
export function createKvProxyAdapter(
  options: KvProxyAdapterOptions,
): ProxyDataAdapter {
  const { kv, keyPrefix = DEFAULT_KV_HOST_KEY_PREFIX, timeoutMs } = options;

  return {
    proxyRoutes: readOnlyProxyRoutes(),
    async resolveHost(host: string): Promise<ResolvedHost | null> {
      const key = buildKvHostKey(keyPrefix, host);
      const lookup = kv.get<ResolvedHost>(key, "json");
      const result =
        timeoutMs && timeoutMs > 0
          ? await withRaceTimeout(lookup, timeoutMs, "kv.get")
          : await lookup;
      return result ?? null;
    },
  };
}
