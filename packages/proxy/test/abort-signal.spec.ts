import { describe, it, expect, vi, afterEach } from "vitest";
import type { CacheAdapter } from "@authhero/adapter-interfaces";
import { createProxyDataPlaneRouter } from "../src/data-plane/router";
import { createInMemoryHostCache } from "../src/data-plane/cache";
import type { HostResolverCache } from "../src/data-plane/cache";
import { createCacheAdapterHostCache } from "../src/data-plane/cache-adapter-cache";
import { createHttpProxyAdapter } from "../src/http-adapter";
import { anySignal, TimeoutError } from "../src/data-plane/timeout";
import type {
  ProxyDataAdapter,
  ResolvedHost,
  ResolveHostOptions,
} from "../src/adapter";

function host(name: string, tenant = "t1"): ResolvedHost {
  return {
    tenant_id: tenant,
    custom_domain_id: "cd1",
    domain: name,
    routes: [],
  };
}

function never(): Promise<never> {
  return new Promise<never>(() => {});
}

// Settles only when `signal` aborts, rejecting with its reason — how fetch
// behaves for an upstream that never answers.
function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) return never();
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

function recordingAdapter(
  impl: (
    h: string,
    signal: AbortSignal | undefined,
  ) => Promise<ResolvedHost | null>,
): ProxyDataAdapter & { signals: Array<AbortSignal | undefined> } {
  const signals: Array<AbortSignal | undefined> = [];
  return {
    signals,
    proxyRoutes: {} as ProxyDataAdapter["proxyRoutes"],
    resolveHost(h: string, options?: ResolveHostOptions) {
      signals.push(options?.signal);
      return impl(h, options?.signal);
    },
  };
}

function mapCacheAdapter(): CacheAdapter {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async deleteByPrefix() {
      return 0;
    },
    async clear() {
      store.clear();
    },
  };
}

describe("resolveHost abort propagation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the HTTP adapter's fetch when the router ceiling fires", async () => {
    let resolveSignal: AbortSignal | undefined;
    const fetchFn = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input.toString(),
        );
        if (url.pathname === "/oauth/token") {
          return Response.json({ access_token: "tok", expires_in: 3600 });
        }
        resolveSignal = init?.signal ?? undefined;
        return untilAborted(resolveSignal);
      },
    );

    const app = createProxyDataPlaneRouter({
      data: createHttpProxyAdapter({
        baseUrl: "https://cp.example.com",
        clientId: "proxy",
        clientSecret: "secret",
        // Inner deadlines far out, so only the router's ceiling can fire.
        timeoutMs: 60_000,
        fetch: fetchFn,
      }),
      cache: { freshTtlMs: 1000, upstreamTimeoutMs: 60_000 },
      resolveHostTimeoutMs: 50,
    });

    const res = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });

    expect(res.status).toBe(504);
    expect(res.headers.get("x-authhero-proxy-error")).toBe(
      "resolve_host_timeout",
    );
    expect(resolveSignal?.aborted).toBe(true);
    expect(resolveSignal?.reason).toBeInstanceOf(TimeoutError);
  });

  it("aborts the upstream when the in-memory cache's own deadline fires", async () => {
    vi.useFakeTimers();
    const data = recordingAdapter((_h, signal) => untilAborted(signal));
    const cache = createInMemoryHostCache(data, {
      freshTtlMs: 1000,
      upstreamTimeoutMs: 100,
    });

    const pending = expect(cache.resolveHost("a.example")).rejects.toThrow(
      /timed out/,
    );
    await vi.advanceTimersByTimeAsync(150);
    await pending;
    expect(data.signals[0]?.aborted).toBe(true);
  });

  it("forwards the caller's abort to an awaited in-memory cache refresh", async () => {
    const data = recordingAdapter((_h, signal) => untilAborted(signal));
    const cache = createInMemoryHostCache(data, {
      freshTtlMs: 1000,
      upstreamTimeoutMs: 60_000,
    });
    const caller = new AbortController();

    const pending = cache.resolveHost("a.example", { signal: caller.signal });
    caller.abort(new TimeoutError(10, "caller"));

    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
    expect(data.signals[0]?.aborted).toBe(true);
  });

  // The background refresh outlives the request that started it and refills
  // the cache for everyone after, so one caller's deadline must not kill it.
  it("does not abort an in-memory background refresh with the caller's signal", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const data = recordingAdapter(async (h) => {
      calls += 1;
      if (calls === 1) return host(h, "t1");
      return never();
    });
    const cache = createInMemoryHostCache(data, {
      freshTtlMs: 1000,
      staleTtlMs: 60_000,
      upstreamTimeoutMs: 60_000,
    });

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(1500);

    const caller = new AbortController();
    const stale = await cache.resolveHost("a.example", {
      signal: caller.signal,
    });
    caller.abort(new TimeoutError(10, "caller"));

    expect(stale?.tenant_id).toBe("t1");
    expect(data.signals).toHaveLength(2);
    expect(data.signals[1]?.aborted).toBe(false);
  });

  it("does not abort a cache-adapter background refresh with the caller's signal", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const signals: Array<AbortSignal | undefined> = [];
    const upstream: HostResolverCache = {
      async resolveHost(h, options) {
        signals.push(options?.signal);
        calls += 1;
        if (calls === 1) return host(h, "t1");
        return never();
      },
    };
    const cache = createCacheAdapterHostCache({
      upstream,
      cache: mapCacheAdapter(),
      freshTtlMs: 1000,
      staleTtlMs: 60_000,
      upstreamTimeoutMs: 60_000,
    });

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(1500);

    const caller = new AbortController();
    const stale = await cache.resolveHost("a.example", {
      signal: caller.signal,
    });
    caller.abort(new TimeoutError(10, "caller"));

    expect(stale?.tenant_id).toBe("t1");
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("forwards the caller's abort to an awaited cache-adapter refresh", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const upstream: HostResolverCache = {
      resolveHost(_h, options) {
        signals.push(options?.signal);
        return untilAborted(options?.signal);
      },
    };
    const cache = createCacheAdapterHostCache({
      upstream,
      cache: mapCacheAdapter(),
      freshTtlMs: 1000,
      upstreamTimeoutMs: 60_000,
    });
    const caller = new AbortController();

    const pending = cache.resolveHost("a.example", { signal: caller.signal });
    // Let the (async) cache read finish so the upstream call has started.
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    caller.abort(new TimeoutError(10, "caller"));

    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
    expect(signals[0]?.aborted).toBe(true);
  });
});

describe("anySignal", () => {
  const nativeAny = Object.getOwnPropertyDescriptor(AbortSignal, "any");

  afterEach(() => {
    if (nativeAny) Object.defineProperty(AbortSignal, "any", nativeAny);
  });

  it("falls back to a manual combiner without AbortSignal.any", () => {
    Object.defineProperty(AbortSignal, "any", {
      value: undefined,
      configurable: true,
    });
    const a = new AbortController();
    const b = new AbortController();
    const combined = anySignal([a.signal, undefined, b.signal]);

    expect(combined).toBeDefined();
    expect(combined?.aborted).toBe(false);
    const reason = new Error("stop");
    b.abort(reason);
    expect(combined?.aborted).toBe(true);
    expect(combined?.reason).toBe(reason);
  });

  it("returns the lone signal unchanged", () => {
    const a = new AbortController();
    expect(anySignal([undefined, a.signal])).toBe(a.signal);
    expect(anySignal([undefined])).toBeUndefined();
  });
});
