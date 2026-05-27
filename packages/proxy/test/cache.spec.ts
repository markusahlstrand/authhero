import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInMemoryHostCache } from "../src/data-plane/cache";
import { ProxyDataAdapter, ResolvedHost } from "../src/adapter";

function makeAdapter(
  resolver: (host: string) => Promise<ResolvedHost | null>,
): ProxyDataAdapter {
  return {
    proxyRoutes: {} as ProxyDataAdapter["proxyRoutes"],
    resolveHost: resolver,
  };
}

function host(name: string): ResolvedHost {
  return {
    tenant_id: "t1",
    custom_domain_id: "cd1",
    domain: name,
    routes: [],
  };
}

describe("in-memory host cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves fresh values from cache without re-fetching", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
    });

    await cache.resolveHost("a.example");
    await cache.resolveHost("a.example");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after fresh TTL expires when no stale window", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
    });

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(1500);
    await cache.resolveHost("a.example");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("serves stale value and refreshes in the background", async () => {
    let counter = 0;
    const fn = vi.fn(async (h: string) => {
      counter += 1;
      return { ...host(h), tenant_id: `t${counter}` };
    });
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
      staleTtlMs: 60_000,
    });

    const first = await cache.resolveHost("a.example");
    expect(first?.tenant_id).toBe("t1");

    vi.advanceTimersByTime(1500); // past fresh, inside stale
    const stale = await cache.resolveHost("a.example");
    expect(stale?.tenant_id).toBe("t1"); // served stale immediately
    expect(fn).toHaveBeenCalledTimes(2); // refresh fired

    await vi.runAllTimersAsync();
    const refreshed = await cache.resolveHost("a.example");
    expect(refreshed?.tenant_id).toBe("t2");
    expect(fn).toHaveBeenCalledTimes(2); // still cached fresh
  });

  it("calls waitUntil with the background refresh promise", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const waitUntil = vi.fn();
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
      staleTtlMs: 60_000,
      waitUntil,
    });

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(1500);
    await cache.resolveHost("a.example");
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once stale window also expires", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
      staleTtlMs: 5000,
    });

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(10_000); // past fresh + stale
    await cache.resolveHost("a.example");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent misses for the same host", async () => {
    const fn = vi.fn(
      (h: string) =>
        new Promise<ResolvedHost | null>((resolve) =>
          setTimeout(() => resolve(host(h)), 50),
        ),
    );
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
    });

    const inflight = Promise.all([
      cache.resolveHost("a.example"),
      cache.resolveHost("a.example"),
      cache.resolveHost("a.example"),
    ]);
    await vi.runAllTimersAsync();
    await inflight;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses separate negative TTL for null results", async () => {
    const fn = vi.fn(async () => null);
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 60_000,
      staleTtlMs: 60_000,
      negativeTtlMs: 500,
    });

    await cache.resolveHost("missing.example");
    vi.advanceTimersByTime(1000); // past negative TTL
    await cache.resolveHost("missing.example");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("supports legacy (ttlMs, maxEntries) signature", async () => {
    const fn = vi.fn(async (h: string) => host(h));
    const cache = createInMemoryHostCache(makeAdapter(fn), 500);

    await cache.resolveHost("a.example");
    vi.advanceTimersByTime(750);
    await cache.resolveHost("a.example");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
