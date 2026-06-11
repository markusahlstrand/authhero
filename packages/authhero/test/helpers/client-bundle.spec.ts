import { describe, expect, it } from "vitest";
import {
  loadClientBundle,
  clientBundleKey,
} from "../../src/helpers/client-bundle";
import { CacheAdapter, DataAdapters } from "@authhero/adapter-interfaces";

function makeCache(): CacheAdapter & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T = unknown>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null;
    },
    async set<T = unknown>(key: string, value: T) {
      store.set(key, value);
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async deleteByPrefix(prefix: string) {
      let count = 0;
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
          store.delete(k);
          count++;
        }
      }
      return count;
    },
    async clear() {
      store.clear();
    },
  };
}

function makeData(): {
  data: DataAdapters;
  calls: Record<string, number>;
} {
  const calls: Record<string, number> = {};
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  const data = {
    tenants: { get: async (id: string) => (bump("tenants.get"), { id }) },
    clients: {
      get: async (_t: string, c: string) => (
        bump("clients.get"), { client_id: c }
      ),
    },
    connections: {
      list: async () => (bump("connections.list"), { connections: [] }),
    },
    clientConnections: {
      listByClient: async () => (bump("clientConnections.listByClient"), []),
    },
    branding: { get: async () => (bump("branding.get"), null) },
    resourceServers: {
      list: async () => (bump("resourceServers.list"), { resource_servers: [] }),
    },
    promptSettings: { get: async () => (bump("promptSettings.get"), null) },
    hooks: { list: async () => (bump("hooks.list"), { hooks: [] }) },
  } as unknown as DataAdapters;
  return { data, calls };
}

describe("loadClientBundle", () => {
  it("fetches every component on cold cache and stores the entry", async () => {
    const cache = makeCache();
    const { data, calls } = makeData();

    const bundle = await loadClientBundle(data, cache, "t1", "c1");

    expect(bundle.tenant).toEqual({ id: "t1" });
    expect(bundle.client).toEqual({ client_id: "c1" });
    expect(calls).toEqual({
      "tenants.get": 1,
      "clients.get": 1,
      "connections.list": 1,
      "clientConnections.listByClient": 1,
      "branding.get": 1,
      "resourceServers.list": 1,
      "promptSettings.get": 1,
      "hooks.list": 1,
    });
    expect(cache.store.has(clientBundleKey("t1", "c1"))).toBe(true);
  });

  it("returns cached entry without any fetches when fresh", async () => {
    const cache = makeCache();
    const { data, calls } = makeData();

    let clock = 1_000_000;
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });

    // 60 seconds later — still fresh (default freshSeconds = 300)
    clock += 60_000;
    const totalCallsBefore = Object.values(calls).reduce((a, b) => a + b, 0);
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });
    const totalCallsAfter = Object.values(calls).reduce((a, b) => a + b, 0);

    expect(totalCallsAfter).toBe(totalCallsBefore);
  });

  it("serves stale and schedules a background refresh when stale window applies", async () => {
    const cache = makeCache();
    const { data, calls } = makeData();

    let clock = 1_000_000;
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });
    const firstFetchCalls = calls["tenants.get"];

    // 400 seconds later: past fresh (300s), within stale (600s more)
    clock += 400_000;
    const scheduled: Promise<unknown>[] = [];
    const result = await loadClientBundle(data, cache, "t1", "c1", {
      now: () => clock,
      scheduleRefresh: (p) => scheduled.push(p),
    });

    // The returned value is the (cached) stale value — the SWR caller does
    // NOT await the refresh.
    expect(result.tenant).toEqual({ id: "t1" });
    expect(scheduled.length).toBe(1);

    // After the refresh completes, the cache entry is rewritten with a new
    // freshUntil > now.
    await Promise.all(scheduled);
    const refreshed = (await cache.get(clientBundleKey("t1", "c1"))) as {
      freshUntil: number;
    };
    expect(refreshed.freshUntil).toBeGreaterThan(clock);
    // Total fetches: 1 initial + 1 refresh.
    expect(calls["tenants.get"]).toBe(firstFetchCalls + 1);
  });

  it("fetches synchronously when stale-window-eligible but no scheduleRefresh provided", async () => {
    const cache = makeCache();
    const { data, calls } = makeData();

    let clock = 1_000_000;
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });
    const firstFetchCalls = calls["tenants.get"];

    clock += 400_000;
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });

    expect(calls["tenants.get"]).toBe(firstFetchCalls + 1);
  });

  it("fetches synchronously when entry is past staleUntil", async () => {
    const cache = makeCache();
    const { data, calls } = makeData();

    let clock = 1_000_000;
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });
    const firstFetchCalls = calls["tenants.get"];

    // Past fresh + stale (900s default)
    clock += 1_000_000;
    const scheduled: Promise<unknown>[] = [];
    await loadClientBundle(data, cache, "t1", "c1", {
      now: () => clock,
      scheduleRefresh: (p) => scheduled.push(p),
    });

    expect(calls["tenants.get"]).toBe(firstFetchCalls + 1);
    expect(scheduled.length).toBe(0);
  });

  it("swallows errors from background refresh", async () => {
    const cache = makeCache();
    let attempts = 0;
    const data = {
      tenants: {
        get: async () => {
          attempts++;
          if (attempts === 1) return { id: "t1" };
          throw new Error("transient");
        },
      },
      clients: { get: async () => ({ client_id: "c1" }) },
      connections: { list: async () => ({ connections: [] }) },
      clientConnections: { listByClient: async () => [] },
      branding: { get: async () => null },
      resourceServers: { list: async () => ({ resource_servers: [] }) },
      promptSettings: { get: async () => null },
      hooks: { list: async () => ({ hooks: [] }) },
    } as unknown as DataAdapters;

    let clock = 1_000_000;
    await loadClientBundle(data, cache, "t1", "c1", { now: () => clock });

    clock += 400_000;
    const scheduled: Promise<unknown>[] = [];
    await loadClientBundle(data, cache, "t1", "c1", {
      now: () => clock,
      scheduleRefresh: (p) => scheduled.push(p),
    });

    // Background refresh should reject internally but not propagate.
    await expect(Promise.all(scheduled)).resolves.toBeDefined();
  });
});
