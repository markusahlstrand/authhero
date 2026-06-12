import { describe, expect, it } from "vitest";
import { prefetchClientBundle } from "../../src/helpers/prefetch-client-bundle";
import { withClientBundle } from "../../src/helpers/with-client-bundle";
import { addRequestScopedDedup } from "../../src/helpers/request-scoped-dedup";
import { addCaching } from "../../src/helpers/cache-wrapper";
import { createInMemoryCache } from "../../src/adapters/cache/in-memory";
import { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Composes the real wrapper stack against a counting raw adapter so we can
 * assert how many times each entity method actually got called.
 */
function makeStack(sharedCache?: ReturnType<typeof createInMemoryCache>) {
  const calls: Record<string, number> = {};
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };

  const raw = {
    tenants: {
      get: async (id: string) => {
        bump(`tenants.get`);
        return { id, name: `tenant-${id}` };
      },
    },
    clients: {
      get: async (t: string, c: string) => {
        bump(`clients.get`);
        return { client_id: c, name: c };
      },
      getByClientId: async (c: string) => {
        bump(`clients.getByClientId`);
        return { client_id: c, tenant_id: "t1", name: c };
      },
    },
    connections: {
      list: async () => {
        bump(`connections.list`);
        return { connections: [] };
      },
    },
    clientConnections: {
      listByClient: async () => {
        bump(`clientConnections.listByClient`);
        return [];
      },
    },
    branding: {
      get: async () => {
        bump(`branding.get`);
        return null;
      },
    },
    resourceServers: {
      list: async () => {
        bump(`resourceServers.list`);
        return { resource_servers: [] };
      },
    },
    promptSettings: {
      get: async () => {
        bump(`promptSettings.get`);
        return null;
      },
    },
    hooks: {
      list: async () => {
        bump(`hooks.list`);
        return { hooks: [] };
      },
    },
    themes: {
      get: async () => {
        bump(`themes.get`);
        return null;
      },
    },
  } as unknown as DataAdapters;

  const cache =
    sharedCache ??
    createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

  const stableEntities = [
    "tenants",
    "clients",
    "connections",
    "clientConnections",
    "branding",
    "resourceServers",
    "promptSettings",
    "hooks",
    "themes",
  ];

  const ctxVar: { client_id?: string; tenant_id?: string } = {};
  const ctx = {
    var: ctxVar,
    set(key: "client_id" | "tenant_id", value: string) {
      ctxVar[key] = value;
    },
    executionCtx: { waitUntil: () => {} },
    env: { data: undefined as unknown as DataAdapters },
  } as any;

  const cached = addCaching(raw, {
    defaultTtl: 300,
    cacheEntities: stableEntities,
    cache,
  });
  const deduped = addRequestScopedDedup(cached, { dedupEntities: stableEntities });
  const bundled = withClientBundle(ctx, deduped, cache);
  ctx.env.data = bundled;

  return { ctx, calls, cache };
}

describe("prefetchClientBundle", () => {
  it("makes exactly one call per bundle-covered entity on cold cache", async () => {
    const { ctx, calls } = makeStack();

    await prefetchClientBundle(ctx, { client_id: "c1" });

    // 1 to discover tenant_id, then 1 per bundle entity (9 in parallel).
    expect(calls["clients.getByClientId"]).toBe(1);
    expect(calls["tenants.get"]).toBe(1);
    expect(calls["clients.get"]).toBe(1);
    expect(calls["connections.list"]).toBe(1);
    expect(calls["clientConnections.listByClient"]).toBe(1);
    expect(calls["branding.get"]).toBe(1);
    expect(calls["resourceServers.list"]).toBe(1);
    expect(calls["promptSettings.get"]).toBe(1);
    expect(calls["hooks.list"]).toBe(1);
    expect(calls["themes.get"]).toBe(1);
  });

  it("sets ctx.var so subsequent reads engage the bundle for free", async () => {
    const { ctx, calls } = makeStack();

    await prefetchClientBundle(ctx, { client_id: "c1" });
    expect(ctx.var.client_id).toBe("c1");
    expect(ctx.var.tenant_id).toBe("t1");

    const callsAfterPrefetch = { ...calls };

    // Every bundle-covered read post-prefetch should hit the in-memory
    // bundle promise, zero extra raw calls.
    await ctx.env.data.tenants.get("t1");
    await ctx.env.data.clients.get("t1", "c1");
    await ctx.env.data.connections.list("t1");
    await ctx.env.data.clientConnections.listByClient("t1", "c1");
    await ctx.env.data.branding.get("t1");
    await ctx.env.data.resourceServers.list("t1");
    await ctx.env.data.promptSettings.get("t1");
    await ctx.env.data.hooks.list("t1");
    await ctx.env.data.themes.get("t1", "default");

    expect(calls).toEqual(callsAfterPrefetch);
  });

  it("skips the getByClientId lookup when tenant_id is provided", async () => {
    const { ctx, calls } = makeStack();

    await prefetchClientBundle(ctx, { client_id: "c1", tenant_id: "t1" });

    expect(calls["clients.getByClientId"]).toBeUndefined();
    expect(calls["tenants.get"]).toBe(1);
    expect(calls["clients.get"]).toBe(1);
  });

  it("throws 403 when the client doesn't exist", async () => {
    const { ctx } = makeStack();
    // Replace getByClientId with a null-returning impl
    (ctx.env.data as any).clients.getByClientId = async () => null;

    await expect(
      prefetchClientBundle(ctx, { client_id: "missing" }),
    ).rejects.toThrow(/Client not found/);
  });

  it("warms the cache so a second request hits zero raw calls", async () => {
    // First request: cold cache, assembles and stores the bundle.
    const stackA = makeStack();
    await prefetchClientBundle(stackA.ctx, { client_id: "c1" });
    expect(stackA.calls["tenants.get"]).toBe(1); // sanity: cold path ran

    // Second request: a genuinely fresh stack (new ctx + request-scoped dedup)
    // that only shares the cross-request cache instance with the first.
    const stackB = makeStack(stackA.cache);
    await prefetchClientBundle(stackB.ctx, { client_id: "c1" });

    // Everything the second request needed — tenant discovery and every
    // bundle-covered entity — was served from the shared cache. Zero raw reads.
    expect(Object.values(stackB.calls).every((n) => n === 0)).toBe(true);
  });
});
