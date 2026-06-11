import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CloudflareCache } from "../src/cache";

function installFakeCaches(matchImpl: (req: Request) => Promise<Response | undefined>) {
  const fakeCache: Cache = {
    async match(req) {
      return matchImpl(req as Request);
    },
    async put() {},
    async delete() {
      return true;
    },
    async add() {},
    async addAll() {},
    async keys() {
      return [];
    },
    async matchAll() {
      return [];
    },
  } as unknown as Cache;

  (globalThis as unknown as { caches: CacheStorage }).caches = {
    default: fakeCache,
    async open() {
      return fakeCache;
    },
    async has() {
      return true;
    },
    async delete() {
      return true;
    },
    async keys() {
      return [];
    },
  } as unknown as CacheStorage;
}

describe("CloudflareCache.get timeout", () => {
  const originalCaches = (globalThis as { caches?: CacheStorage }).caches;

  afterEach(() => {
    (globalThis as unknown as { caches?: CacheStorage }).caches = originalCaches;
  });

  it("returns the cached value when match resolves within the timeout", async () => {
    installFakeCaches(async () => {
      const body = JSON.stringify({ value: { hello: "world" }, cachedAt: new Date().toISOString() });
      return new Response(body, { headers: { "Content-Type": "application/json" } });
    });
    const cache = new CloudflareCache({ getTimeoutMs: 100 });
    const result = await cache.get<{ hello: string }>("key");
    expect(result).toEqual({ hello: "world" });
  });

  it("returns null when match() stalls past the timeout", async () => {
    installFakeCaches(
      () =>
        new Promise<Response>(() => {
          // never resolves
        }),
    );
    const cache = new CloudflareCache({ getTimeoutMs: 25 });
    const start = Date.now();
    const result = await cache.get("key");
    const elapsed = Date.now() - start;

    expect(result).toBeNull();
    // Allow a generous upper bound for CI jitter
    expect(elapsed).toBeLessThan(500);
  });

  it("disables the timeout when getTimeoutMs is 0", async () => {
    let resolveMatch!: (response: Response | undefined) => void;
    installFakeCaches(
      () =>
        new Promise<Response | undefined>((res) => {
          resolveMatch = res;
        }),
    );
    const cache = new CloudflareCache({ getTimeoutMs: 0 });
    const promise = cache.get("key");

    setTimeout(() => resolveMatch(undefined), 40);

    const result = await promise;
    expect(result).toBeNull();
  });
});
