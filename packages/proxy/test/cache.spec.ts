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

  // Concurrent misses each call the upstream on purpose. Sharing one pending
  // promise between callers is what stranded whole isolates: a promise belongs
  // to the request that created it, so once that request ends it may never
  // settle, and everyone still awaiting it hangs.
  it("resolves every concurrent miss for the same host", async () => {
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
      // The first caller is stranded exactly as a cancelled request strands a
      // pending fetch on Workers: the promise settles neither way, ever.
      if (calls === 1) return new Promise<ResolvedHost | null>(() => {});
      return Promise.resolve(host(h));
    });
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
      upstreamTimeoutMs: 2000,
    });

    // Attach the rejection handler before the deadline fires, or the
    // rejection is briefly unhandled and Node reports it.
    const stranded = expect(cache.resolveHost("a.example")).rejects.toThrow(
      /timed out/,
    );
    await vi.advanceTimersByTimeAsync(2100);
    await stranded;

    // The next request must reach the upstream rather than await the corpse of
    // the first one.
    const after = cache.resolveHost("a.example");
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
    const cache = createInMemoryHostCache(makeAdapter(fn), {
      freshTtlMs: 1000,
      staleIfErrorTtlMs: 60_000,
      upstreamTimeoutMs: 2000,
    });

    expect(await cache.resolveHost("a.example")).toEqual(host("a.example"));

    vi.advanceTimersByTime(1500); // past fresh, inside stale-if-error
    const pending = cache.resolveHost("a.example");
    await vi.advanceTimersByTimeAsync(2100);

    // Without a deadline on the upstream call this would hang instead, and the
    // last known-good value below would never be reached.
    expect(await pending).toEqual(host("a.example"));
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
