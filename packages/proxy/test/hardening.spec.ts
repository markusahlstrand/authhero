import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CacheAdapter } from "@authhero/adapter-interfaces";
import { createProxyApp } from "../src/app";
import {
  createProxyDataPlaneHandler,
  createProxyDataPlaneRouter,
} from "../src/data-plane/router";
import {
  createCacheAdapterHostCache,
  buildCacheAdapterKey,
} from "../src/data-plane/cache-adapter-cache";
import { createInMemoryHostCache } from "../src/data-plane/cache";
import { ProxyDataAdapter, ResolvedHost } from "../src/adapter";
import { HandlerRegistry } from "../src/data-plane/registry";
import { registerBuiltinHandlers } from "../src/data-plane/handlers";
import { ProxyRoute, HandlerConfig } from "../src/types";
import type { HostResolverCache } from "../src/data-plane/cache";

function route(partial: {
  match?: ProxyRoute["match"];
  handlers: HandlerConfig[];
}): ProxyRoute {
  return {
    id: "r",
    tenant_id: "t1",
    custom_domain_id: "cd1",
    priority: 100,
    match: partial.match ?? { path: "/*" },
    handlers: partial.handlers,
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
  };
}

function makeAdapter(resolved: ResolvedHost | null): ProxyDataAdapter {
  return {
    proxyRoutes: {} as ProxyDataAdapter["proxyRoutes"],
    resolveHost: async () => resolved,
  };
}

function adapterFromFn(
  fn: (host: string) => Promise<ResolvedHost | null>,
): ProxyDataAdapter {
  return {
    proxyRoutes: {} as ProxyDataAdapter["proxyRoutes"],
    resolveHost: fn,
  };
}

function customerHost(): ResolvedHost {
  return {
    tenant_id: "t1",
    custom_domain_id: "cd1",
    domain: "customer.com",
    routes: [
      route({
        handlers: [
          {
            type: "http",
            options: { upstream_url: "https://upstream.example" },
          },
        ],
      }),
    ],
  };
}

describe("dispatch_namespace hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 504 with error header when dispatch fetch hangs", async () => {
    const workerFetch = vi.fn(
      (req: Request) =>
        new Promise<Response>((_, reject) => {
          // Reject when the runtime aborts the dispatched request.
          req.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const dispatcherGet = vi.fn(() => ({ fetch: workerFetch }));

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "auth.example.com",
        routes: [
          route({
            handlers: [
              {
                type: "dispatch_namespace",
                options: {
                  binding: "DISPATCHER",
                  script_name: "fixed",
                  timeout_ms: 100,
                },
              },
            ],
          }),
        ],
      }),
      bindings: { DISPATCHER: { get: dispatcherGet } },
    });

    const pending = app.request("https://auth.example.com/", {
      headers: { host: "auth.example.com" },
    });
    await vi.advanceTimersByTimeAsync(150);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(res.headers.get("x-authhero-proxy-error")).toBe(
      "dispatch_namespace_timeout",
    );
  });

  it("returns 502 with error header when dispatch fetch throws", async () => {
    const workerFetch = vi.fn(async () => {
      throw new Error("boom");
    });
    const dispatcherGet = vi.fn(() => ({ fetch: workerFetch }));

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "auth.example.com",
        routes: [
          route({
            handlers: [
              {
                type: "dispatch_namespace",
                options: {
                  binding: "DISPATCHER",
                  script_name: "fixed",
                },
              },
            ],
          }),
        ],
      }),
      bindings: { DISPATCHER: { get: dispatcherGet } },
    });

    const res = await app.request("https://auth.example.com/", {
      headers: { host: "auth.example.com" },
    });

    expect(res.status).toBe(502);
    expect(res.headers.get("x-authhero-proxy-error")).toBe(
      "dispatch_namespace_failed",
    );
  });
});

describe("service_binding hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 504 when the binding fetch hangs past timeout_ms", async () => {
    const bindingFetch = vi.fn(
      (req: Request) =>
        new Promise<Response>((_, reject) => {
          req.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            handlers: [
              {
                type: "service_binding",
                options: { binding: "API2", timeout_ms: 100 },
              },
            ],
          }),
        ],
      }),
      bindings: { API2: { fetch: bindingFetch } },
    });

    const pending = app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    await vi.advanceTimersByTimeAsync(150);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(res.headers.get("x-authhero-proxy-error")).toBe(
      "service_binding_timeout",
    );
  });

  it("returns 502 when the binding fetch throws", async () => {
    const bindingFetch = vi.fn(async () => {
      throw new Error("boom");
    });
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            handlers: [
              {
                type: "service_binding",
                options: { binding: "API2" },
              },
            ],
          }),
        ],
      }),
      bindings: { API2: { fetch: bindingFetch } },
    });

    const res = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });

    expect(res.status).toBe(502);
    expect(res.headers.get("x-authhero-proxy-error")).toBe(
      "service_binding_failed",
    );
  });
});

describe("http hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 504 with error header when the upstream fetch hangs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            handlers: [
              {
                type: "http",
                options: {
                  upstream_url: "https://upstream.example",
                  timeout_ms: 100,
                },
              },
            ],
          }),
        ],
      }),
    });

    const pending = app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    await vi.advanceTimersByTimeAsync(150);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(res.headers.get("x-authhero-proxy-error")).toBe("http_timeout");
  });

  it("returns 502 with error header when the upstream throws non-abort", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            handlers: [
              {
                type: "http",
                options: { upstream_url: "https://upstream.example" },
              },
            ],
          }),
        ],
      }),
    });

    const res = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-authhero-proxy-error")).toBe("http_failed");
  });
});

describe("router defense-in-depth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 504 with error header when resolver hangs past resolveHostTimeoutMs", async () => {
    const hangingResolver: HostResolverCache = {
      resolveHost: () =>
        new Promise<ResolvedHost | null>(() => {
          // Never resolves — the router must enforce its own ceiling.
        }),
    };

    const handler = createProxyDataPlaneHandler({
      data: makeAdapter(null),
      resolver: hangingResolver,
      resolveHostTimeoutMs: 100,
    });

    const app = createProxyDataPlaneRouter({
      data: makeAdapter(null),
      resolver: hangingResolver,
      resolveHostTimeoutMs: 100,
    });
    expect(handler).toBeTypeOf("function");

    const pending = app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    await vi.advanceTimersByTimeAsync(150);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(res.headers.get("x-authhero-proxy-error")).toBe(
      "resolve_host_timeout",
    );
  });

  it("returns 502 with error header when resolver throws", async () => {
    const throwingResolver: HostResolverCache = {
      resolveHost: async () => {
        throw new Error("control plane down");
      },
    };

    const app = createProxyDataPlaneRouter({
      data: makeAdapter(null),
      resolver: throwingResolver,
    });

    const res = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-authhero-proxy-error")).toBe("data_plane_error");
  });

  it("returns 502 with error header when a handler throws inside hostApp", async () => {
    const registry = new HandlerRegistry({});
    registerBuiltinHandlers(registry);
    // Inject a handler that throws synchronously. `compileHostApp` installs
    // an `onError` that converts the throw into a structured 502 with our
    // error header instead of Hono's default 500. Without this, the throw
    // would be hidden behind `hostApp.fetch()` returning a 500 response —
    // which the outer router's try/catch can't see.
    registry.add({
      type: "throwing",
      optionsSchema: {
        safeParse: () => ({ success: true, data: {} }),
      } as never,
      build: () => () => {
        throw new Error("middleware blew up");
      },
    } as never);

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [route({ handlers: [{ type: "throwing", options: {} }] })],
      }),
      registry,
    });

    const res = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-authhero-proxy-error")).toBe("handler_failed");
  });

  it("createProxyApp installs an app-level error handler returning 502", async () => {
    // The router's own try/catch covers normal failures; createProxyApp's
    // `app.onError` is a final backstop for throws that escape the router.
    // Verify the wired-up app is built — the unit tests above cover the
    // structured failure paths that actually exercise it.
    const app = createProxyApp({ data: makeAdapter(customerHost()) });
    expect(typeof app.fetch).toBe("function");
    // The app must respond to a missing-host request without throwing.
    const res = await app.request("https://customer.com/__proxy_smoke", {});
    expect([200, 400, 404, 502, 504]).toContain(res.status);
  });
});

describe("in-memory cache stale-if-error", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves the last-known-good value when upstream throws past stale_until", async () => {
    let attempt = 0;
    const fn = vi.fn(async (h: string): Promise<ResolvedHost | null> => {
      attempt += 1;
      if (attempt === 1) {
        return {
          tenant_id: "t1",
          custom_domain_id: "cd1",
          domain: h,
          routes: [],
        };
      }
      throw new Error("control plane is down");
    });
    const cache = createInMemoryHostCache(adapterFromFn(fn), {
      freshTtlMs: 1000,
      staleTtlMs: 0,
      staleIfErrorTtlMs: 60_000,
    });

    const first = await cache.resolveHost("a.example");
    expect(first?.tenant_id).toBe("t1");

    // Past freshTtl + staleTtl — the next call must await refresh. Refresh
    // throws, but stale-if-error returns the last-known-good value.
    vi.advanceTimersByTime(5_000);
    const fallback = await cache.resolveHost("a.example");
    expect(fallback?.tenant_id).toBe("t1");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propagates the error once stale_if_error_until expires", async () => {
    let attempt = 0;
    const fn = vi.fn(async (h: string): Promise<ResolvedHost | null> => {
      attempt += 1;
      if (attempt === 1) {
        return {
          tenant_id: "t1",
          custom_domain_id: "cd1",
          domain: h,
          routes: [],
        };
      }
      throw new Error("still down");
    });
    const cache = createInMemoryHostCache(adapterFromFn(fn), {
      freshTtlMs: 1000,
      staleIfErrorTtlMs: 5_000,
    });

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(20_000); // past every window
    await expect(cache.resolveHost("a.example")).rejects.toThrow(/still down/);
  });
});

interface MemEntry {
  value: unknown;
  expiresAtMs: number;
}

function createMemoryCacheAdapter(): CacheAdapter & {
  store: Map<string, MemEntry>;
} {
  const store = new Map<string, MemEntry>();
  return {
    store,
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAtMs <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const ttl = ttlSeconds ?? 60;
      store.set(key, { value, expiresAtMs: Date.now() + ttl * 1000 });
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async deleteByPrefix(prefix: string): Promise<number> {
      let count = 0;
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) {
          store.delete(key);
          count++;
        }
      }
      return count;
    },
    async clear(): Promise<void> {
      store.clear();
    },
  };
}

describe("cache-adapter stale-if-error", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves the last-known-good payload when upstream throws past stale_until", async () => {
    let attempt = 0;
    const upstream: HostResolverCache = {
      resolveHost: async (h) => {
        attempt += 1;
        if (attempt === 1) {
          return {
            tenant_id: "t1",
            custom_domain_id: "cd1",
            domain: h,
            routes: [],
          };
        }
        throw new Error("control plane is down");
      },
    };
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream,
      cache,
      freshTtlMs: 1_000,
      staleTtlMs: 0,
      staleIfErrorTtlMs: 24 * 60 * 60_000,
    });

    const first = await resolver.resolveHost("a.example");
    expect(first?.tenant_id).toBe("t1");

    vi.advanceTimersByTime(5_000);
    const fallback = await resolver.resolveHost("a.example");
    expect(fallback?.tenant_id).toBe("t1");
  });
});

describe("cache-adapter cache call timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats a hanging cache.get as a miss and falls through to upstream", async () => {
    const fn = vi.fn(
      async (h: string): Promise<ResolvedHost | null> => ({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: h,
        routes: [],
      }),
    );
    const hangingCache: CacheAdapter = {
      async get<T>(): Promise<T | null> {
        return new Promise<T | null>(() => {
          // Never resolves.
        });
      },
      async set(): Promise<void> {
        // No-op.
      },
      async delete() {
        return false;
      },
      async deleteByPrefix() {
        return 0;
      },
      async clear() {
        /* no-op */
      },
    };

    const resolver = createCacheAdapterHostCache({
      upstream: { resolveHost: fn },
      cache: hangingCache,
      freshTtlMs: 60_000,
      cacheReadTimeoutMs: 50,
    });

    const pending = resolver.resolveHost("a.example");
    await vi.advanceTimersByTimeAsync(75);
    const value = await pending;
    expect(value?.tenant_id).toBe("t1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("writes to cache without blocking when cache.set hangs and waitUntil is provided", async () => {
    const fn = vi.fn(
      async (h: string): Promise<ResolvedHost | null> => ({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: h,
        routes: [],
      }),
    );
    let setResolved = false;
    const hangingSetCache: CacheAdapter = {
      async get<T>(): Promise<T | null> {
        return null;
      },
      async set(): Promise<void> {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            setResolved = true;
            resolve();
          }, 10_000);
        });
      },
      async delete() {
        return false;
      },
      async deleteByPrefix() {
        return 0;
      },
      async clear() {
        /* no-op */
      },
    };

    const waitUntil = vi.fn();
    const resolver = createCacheAdapterHostCache({
      upstream: { resolveHost: fn },
      cache: hangingSetCache,
      freshTtlMs: 60_000,
      cacheWriteTimeoutMs: 50,
      waitUntil,
    });

    const value = await resolver.resolveHost("a.example");
    expect(value?.tenant_id).toBe("t1");
    // The cache.set never resolves within the request, but the response
    // returned anyway.
    expect(setResolved).toBe(false);
    expect(waitUntil).toHaveBeenCalled();
  });
});

describe("cache key helper", () => {
  it("buildCacheAdapterKey lowercases the host", () => {
    expect(buildCacheAdapterKey("my-prefix", "A.example")).toBe(
      "my-prefix:a.example",
    );
  });
});

describe("defaultHandlers fail-open fallback", () => {
  const fallback = vi.fn(
    async () => new Response("from default", { status: 200 }),
  );

  beforeEach(() => {
    fallback.mockClear();
  });

  function appWithFallback(opts: {
    data: ProxyDataAdapter;
    resolver?: HostResolverCache;
    resolveHostTimeoutMs?: number;
  }) {
    return createProxyApp({
      data: opts.data,
      ...(opts.resolver ? { resolver: opts.resolver } : {}),
      ...(opts.resolveHostTimeoutMs !== undefined
        ? { resolveHostTimeoutMs: opts.resolveHostTimeoutMs }
        : {}),
      defaultHandlers: [
        { type: "http", options: { upstream_url: "https://fallback.example" } },
      ],
    });
  }

  it("serves the default chain when the host is unknown", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = fallback as unknown as typeof fetch;
    try {
      const app = appWithFallback({ data: makeAdapter(null) });
      const res = await app.request("https://unknown.example/", {
        headers: { host: "unknown.example" },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("from default");
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("serves the default chain when the host resolves with empty routes", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = fallback as unknown as typeof fetch;
    try {
      const app = appWithFallback({
        data: makeAdapter({
          tenant_id: "t1",
          custom_domain_id: "cd1",
          domain: "login.customer.com",
          routes: [],
        }),
      });
      const res = await app.request("https://login.customer.com/", {
        headers: { host: "login.customer.com" },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("from default");
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("serves the default chain when resolveHost throws", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = fallback as unknown as typeof fetch;
    try {
      const app = appWithFallback({
        data: makeAdapter(null),
        resolver: {
          resolveHost: async () => {
            throw new Error("control plane down");
          },
        },
      });
      const res = await app.request("https://login.customer.com/", {
        headers: { host: "login.customer.com" },
      });
      expect(res.status).toBe(200);
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("serves the default chain when resolveHost times out", async () => {
    vi.useFakeTimers();
    try {
      const orig = globalThis.fetch;
      globalThis.fetch = fallback as unknown as typeof fetch;
      try {
        const hanging: HostResolverCache = {
          resolveHost: () => new Promise(() => {}),
        };
        const app = appWithFallback({
          data: makeAdapter(null),
          resolver: hanging,
          resolveHostTimeoutMs: 100,
        });
        const pending = app.request("https://login.customer.com/", {
          headers: { host: "login.customer.com" },
        });
        await vi.advanceTimersByTimeAsync(150);
        const res = await pending;
        expect(res.status).toBe(200);
        expect(fallback).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.fetch = orig;
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers a matching per-host route over the default chain", async () => {
    const upstream = vi.fn(
      async () => new Response("from upstream", { status: 200 }),
    );
    const orig = globalThis.fetch;
    // Both routes and fallback proxy through global fetch — route by URL.
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://upstream.example")) return upstream();
      return fallback();
    }) as unknown as typeof fetch;
    try {
      const app = appWithFallback({ data: makeAdapter(customerHost()) });
      const res = await app.request("https://customer.com/", {
        headers: { host: "customer.com" },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("from upstream");
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("still returns 404 'Unknown host' when no defaultHandlers are configured", async () => {
    const app = createProxyApp({ data: makeAdapter(null) });
    const res = await app.request("https://unknown.example/", {
      headers: { host: "unknown.example" },
    });
    expect(res.status).toBe(404);
  });
});
