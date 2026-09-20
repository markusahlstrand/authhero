import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CacheAdapter } from "@authhero/adapter-interfaces";
import { createCacheAdapterHostCache } from "../src/data-plane/cache-adapter-cache";
import type { HostResolverCache } from "../src/data-plane/cache";
import type { ResolvedHost } from "../src/adapter";

function host(name: string, tenant = "t1"): ResolvedHost {
  return {
    tenant_id: tenant,
    custom_domain_id: "cd1",
    domain: name,
    routes: [],
  };
}

interface CacheEntry {
  value: unknown;
  expiresAtMs: number;
}

function createMemoryCacheAdapter(): CacheAdapter & {
  store: Map<string, CacheEntry>;
} {
  const store = new Map<string, CacheEntry>();
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
      store.set(key, {
        value,
        expiresAtMs: Date.now() + ttl * 1000,
      });
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

function makeUpstream(
  resolver: (host: string) => Promise<ResolvedHost | null>,
): HostResolverCache {
  return { resolveHost: resolver };
}

describe("cache-adapter host cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves fresh values from the adapter without hitting upstream", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 60_000,
    });

    await resolver.resolveHost("a.example");
    await resolver.resolveHost("a.example");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
  });

  it("normalizes host casing in the cache key", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 60_000,
    });

    await resolver.resolveHost("A.example");
    await resolver.resolveHost("a.example");
    await resolver.resolveHost("a.EXAMPLE");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("serves stale value and refreshes in the background", async () => {
    let counter = 0;
    const fn = vi.fn(async (h: string) => {
      counter += 1;
      return host(h, `t${counter}`);
    });
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 1000,
      staleTtlMs: 60_000,
    });

    const first = await resolver.resolveHost("a.example");
    expect(first?.tenant_id).toBe("t1");

    vi.advanceTimersByTime(1500); // past fresh, inside stale
    const stale = await resolver.resolveHost("a.example");
    expect(stale?.tenant_id).toBe("t1");
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    const refreshed = await resolver.resolveHost("a.example");
    expect(refreshed?.tenant_id).toBe("t2");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("invokes waitUntil with background refresh and cache writes", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const waitUntil = vi.fn();
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 1000,
      staleTtlMs: 60_000,
      waitUntil,
    });

    await resolver.resolveHost("a.example"); // one waitUntil for the cold cache.set
    vi.advanceTimersByTime(1500);
    await resolver.resolveHost("a.example"); // one waitUntil for the SWR refresh + one for its cache.set

    // Cache writes are fire-and-forget via waitUntil so the request never
    // blocks on a slow cache. Just assert the runtime gets at least one
    // promise to keep alive — the exact count includes both the background
    // refresh and the cache.set inside it.
    expect(waitUntil).toHaveBeenCalled();
    expect(waitUntil.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("re-fetches after fresh + stale window expires", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 1000,
      staleTtlMs: 5000,
    });

    await resolver.resolveHost("a.example");
    vi.advanceTimersByTime(10_000);
    await resolver.resolveHost("a.example");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  // Concurrent misses each call the upstream on purpose — see the matching
  // note in cache.spec.ts for why no pending promise is shared between them.
  it("resolves every concurrent in-isolate refresh", async () => {
    const fn = vi.fn(
      (h: string) =>
        new Promise<ResolvedHost | null>((resolve) =>
          setTimeout(() => resolve(host(h)), 50),
        ),
    );
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 1000,
    });

    const inflight = Promise.all([
      resolver.resolveHost("a.example"),
      resolver.resolveHost("a.example"),
      resolver.resolveHost("a.example"),
    ]);
    await vi.runAllTimersAsync();

    expect(await inflight).toEqual([
      host("a.example"),
      host("a.example"),
      host("a.example"),
    ]);
  });

  it("does not let a refresh that never settles wedge later lookups", async () => {
    let calls = 0;
    const fn = vi.fn((h: string) => {
      calls += 1;
      if (calls === 1) return new Promise<ResolvedHost | null>(() => {});
      return Promise.resolve(host(h));
    });
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 1000,
      upstreamTimeoutMs: 2000,
    });

    // Attach the rejection handler before the deadline fires, or the
    // rejection is briefly unhandled and Node reports it.
    const stranded = expect(resolver.resolveHost("a.example")).rejects.toThrow(
      /timed out/,
    );
    await vi.advanceTimersByTimeAsync(2100);
    await stranded;

    const after = resolver.resolveHost("a.example");
    await vi.runAllTimersAsync();
    expect(await after).toEqual(host("a.example"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("serves stale-if-error when a refresh times out", async () => {
    let calls = 0;
    const fn = vi.fn((h: string) => {
      calls += 1;
      if (calls === 1) return Promise.resolve(host(h));
      return new Promise<ResolvedHost | null>(() => {});
    });
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 1000,
      staleIfErrorTtlMs: 60_000,
      upstreamTimeoutMs: 2000,
    });

    expect(await resolver.resolveHost("a.example")).toEqual(host("a.example"));

    vi.advanceTimersByTime(1500);
    const pending = resolver.resolveHost("a.example");
    await vi.advanceTimersByTimeAsync(2100);

    expect(await pending).toEqual(host("a.example"));
  });

  it("uses a separate negative TTL for null upstream results", async () => {
    const fn = vi.fn(async () => null);
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 60_000,
      staleTtlMs: 60_000,
      negativeTtlMs: 500,
    });

    await resolver.resolveHost("missing.example");
    vi.advanceTimersByTime(1000);
    await resolver.resolveHost("missing.example");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects a custom keyPrefix", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createMemoryCacheAdapter();
    const resolver = createCacheAdapterHostCache({
      upstream: makeUpstream(fn),
      cache,
      freshTtlMs: 60_000,
      keyPrefix: "my-proxy",
    });

    await resolver.resolveHost("a.example");

    const keys = Array.from(cache.store.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("my-proxy:a.example");
  });
});
