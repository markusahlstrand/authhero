import { describe, expect, it } from "vitest";
import { addCaching } from "../../src/helpers/cache-wrapper";
import { addRequestScopedDedup } from "../../src/helpers/request-scoped-dedup";
import { addBundleWritePurge } from "../../src/helpers/bundle-write-purge";
import { withClientBundle } from "../../src/helpers/with-client-bundle";
import { createInMemoryCache } from "../../src/adapters/cache/in-memory";
import { clientBundleKey } from "../../src/helpers/client-bundle";
import { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Composes the same wrapper stack auth-api uses in production so the layers
 * are exercised together: addCaching → addRequestScopedDedup →
 * addBundleWritePurge → withClientBundle.
 */
function makeStack(opts: {
  tenant_id?: string;
  client_id?: string;
  cache?: ReturnType<typeof createInMemoryCache>;
}) {
  const calls: Record<string, number> = {};
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };

  // The raw adapter — represents the DB.
  const raw = {
    tenants: {
      get: async (id: string) => (bump(`tenants.get:${id}`), { id }),
      update: async () => {},
    },
    clients: {
      get: async (t: string, c: string) => (
        bump(`clients.get:${t}:${c}`),
        { client_id: c, name: c }
      ),
      getByClientId: async (c: string) => (
        bump(`clients.getByClientId:${c}`),
        { client_id: c, tenant_id: "t1", name: c }
      ),
      update: async () => true,
    },
    connections: {
      list: async (t: string) => (
        bump(`connections.list:${t}`),
        { connections: [{ id: "g" }] }
      ),
      update: async () => true,
    },
    clientConnections: {
      listByClient: async (t: string, c: string) => (
        bump(`clientConnections.listByClient:${t}:${c}`),
        [{ id: "cc" }]
      ),
      updateByClient: async () => true,
    },
    branding: {
      get: async (t: string) => (
        bump(`branding.get:${t}`),
        { primary_color: "#abc" }
      ),
      set: async () => {},
    },
    resourceServers: {
      list: async (t: string) => (
        bump(`resourceServers.list:${t}`),
        { resource_servers: [] }
      ),
      update: async () => true,
    },
    promptSettings: {
      get: async (t: string) => (bump(`promptSettings.get:${t}`), { x: 1 }),
      set: async () => {},
    },
    hooks: {
      list: async (t: string) => (bump(`hooks.list:${t}`), { hooks: [] }),
      update: async () => true,
    },
    themes: {
      get: async (t: string, id: string) => (
        bump(`themes.get:${t}:${id}`),
        null
      ),
    },
  } as unknown as DataAdapters;

  const cache =
    opts.cache ??
    createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

  const ctx = {
    var: { tenant_id: opts.tenant_id, client_id: opts.client_id },
    executionCtx: { waitUntil: () => {} },
  } as any;

  const stableEntities = [
    "tenants",
    "connections",
    "clientConnections",
    "clients",
    "branding",
    "promptSettings",
    "resourceServers",
    "hooks",
    "themes",
  ];

  const cached = addCaching(raw, {
    defaultTtl: 300,
    cacheEntities: stableEntities,
    cache,
  });
  const deduped = addRequestScopedDedup(cached, {
    dedupEntities: stableEntities,
  });
  const purging = addBundleWritePurge(deduped, cache);
  const data = withClientBundle(ctx, purging, cache);

  return { data, calls, cache };
}

describe("cache stack integration (L0 + L1 + L2)", () => {
  it("loads the bundle once and serves all 8 entity reads from it", async () => {
    const { data, calls } = makeStack({ tenant_id: "t1", client_id: "c1" });

    // Eight reads, each touching a bundle-covered entity exactly once.
    await Promise.all([
      data.tenants.get("t1"),
      data.clients.get("t1", "c1"),
      data.connections.list("t1"),
      data.clientConnections.listByClient("t1", "c1"),
      data.branding.get("t1"),
      data.resourceServers.list("t1"),
      data.promptSettings.get("t1"),
      data.hooks.list("t1"),
    ]);

    // Each raw adapter method called exactly once (during the bundle's
    // parallel fetch). The bundle is shared across all 8 callers.
    expect(calls["tenants.get:t1"]).toBe(1);
    expect(calls["clients.get:t1:c1"]).toBe(1);
    expect(calls["connections.list:t1"]).toBe(1);
    expect(calls["clientConnections.listByClient:t1:c1"]).toBe(1);
    expect(calls["branding.get:t1"]).toBe(1);
    expect(calls["resourceServers.list:t1"]).toBe(1);
    expect(calls["promptSettings.get:t1"]).toBe(1);
    expect(calls["hooks.list:t1"]).toBe(1);
  });

  it("repeated reads within the same request never re-hit the raw adapter", async () => {
    const { data, calls } = makeStack({ tenant_id: "t1", client_id: "c1" });

    await data.tenants.get("t1");
    await data.clients.get("t1", "c1");
    // Second pass — should all come from the in-memory bundle promise
    await data.tenants.get("t1");
    await data.clients.get("t1", "c1");
    await data.connections.list("t1");
    await data.branding.get("t1");

    // Each raw method still called once, despite multiple wrapper invocations.
    expect(calls["tenants.get:t1"]).toBe(1);
    expect(calls["clients.get:t1:c1"]).toBe(1);
    expect(calls["connections.list:t1"]).toBe(1);
    expect(calls["branding.get:t1"]).toBe(1);
  });

  it("reuses the persistent bundle entry across separate request stacks", async () => {
    const cache = createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

    const req1 = makeStack({ tenant_id: "t1", client_id: "c1", cache });
    await req1.data.tenants.get("t1");
    await req1.data.clients.get("t1", "c1");
    expect(req1.calls["tenants.get:t1"]).toBe(1);

    // Second request: a fresh stack, but the same persistent cache.
    const req2 = makeStack({ tenant_id: "t1", client_id: "c1", cache });
    await req2.data.tenants.get("t1");
    await req2.data.clients.get("t1", "c1");
    await req2.data.connections.list("t1");

    // The bundle entry from req1 should serve req2 entirely — zero raw calls
    // happen inside req2's stack.
    expect(req2.calls["tenants.get:t1"]).toBeUndefined();
    expect(req2.calls["clients.get:t1:c1"]).toBeUndefined();
    expect(req2.calls["connections.list:t1"]).toBeUndefined();
  });

  it("clients.update purges the bundle on the local edge", async () => {
    const cache = createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

    const req1 = makeStack({ tenant_id: "t1", client_id: "c1", cache });
    await req1.data.clients.get("t1", "c1");
    expect(req1.calls["clients.get:t1:c1"]).toBe(1);
    expect(await cache.get(clientBundleKey("t1", "c1"))).not.toBeNull();

    // Mutation purges the bundle key.
    await req1.data.clients.update("t1", "c1", {} as never);
    expect(await cache.get(clientBundleKey("t1", "c1"))).toBeNull();

    // A new request must refetch the bundle from raw.
    const req2 = makeStack({ tenant_id: "t1", client_id: "c1", cache });
    await req2.data.clients.get("t1", "c1");
    expect(req2.calls["clients.get:t1:c1"]).toBe(1);
  });

  it("connections.update (tenant-scoped) purges every bundle for that tenant via prefix", async () => {
    const cache = createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

    // Warm two bundles in the same tenant.
    const reqA = makeStack({ tenant_id: "t1", client_id: "c1", cache });
    await reqA.data.tenants.get("t1");
    const reqB = makeStack({ tenant_id: "t1", client_id: "c2", cache });
    await reqB.data.tenants.get("t1");
    expect(await cache.get(clientBundleKey("t1", "c1"))).not.toBeNull();
    expect(await cache.get(clientBundleKey("t1", "c2"))).not.toBeNull();

    // Tenant-scoped write — in-memory cache supports prefix delete, so both
    // bundle keys are purged. (On Cloudflare Cache this would only no-op.)
    await reqA.data.connections.update("t1", "conn", {} as never);

    expect(await cache.get(clientBundleKey("t1", "c1"))).toBeNull();
    expect(await cache.get(clientBundleKey("t1", "c2"))).toBeNull();
  });

  it("falls through to L1/L2 when client_id is unknown", async () => {
    const { data, calls } = makeStack({ tenant_id: "t1" });

    // Without a client_id, the bundle wrapper falls through to L1.
    await data.tenants.get("t1");
    await data.tenants.get("t1");

    // L1 dedups the second call within the request.
    expect(calls["tenants.get:t1"]).toBe(1);
    // No bundle fetch happened (no other entities touched).
    expect(calls["clients.get:t1:c1"]).toBeUndefined();
    expect(calls["connections.list:t1"]).toBeUndefined();
  });
});
