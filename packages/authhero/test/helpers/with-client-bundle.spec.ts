import { describe, expect, it } from "vitest";
import { withClientBundle } from "../../src/helpers/with-client-bundle";
import { CacheAdapter, DataAdapters } from "@authhero/adapter-interfaces";

function makeCache(): CacheAdapter & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T = unknown>(key: string) {
      return (store.get(key) as T) ?? null;
    },
    async set<T = unknown>(key: string, value: T) {
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

function makeUpstream() {
  const calls: Record<string, number> = {};
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  const upstream = {
    tenants: {
      get: async (id: string) => {
        bump(`tenants.get:${id}`);
        return { id, name: `tenant-${id}` };
      },
    },
    clients: {
      get: async (t: string, c: string) => {
        bump(`clients.get:${t}:${c}`);
        return { client_id: c, name: `client-${c}` };
      },
      getByClientId: async (c: string) => {
        bump(`clients.getByClientId:${c}`);
        return { client_id: c, tenant_id: "from-upstream" };
      },
    },
    connections: {
      list: async (t: string) => {
        bump(`connections.list:${t}`);
        return { connections: [{ id: "conn-1" }] };
      },
    },
    clientConnections: {
      listByClient: async (t: string, c: string) => {
        bump(`clientConnections.listByClient:${t}:${c}`);
        return [{ id: "cc-1" }];
      },
    },
    branding: {
      get: async (t: string) => {
        bump(`branding.get:${t}`);
        return { primary_color: "#000" };
      },
    },
    resourceServers: {
      list: async (t: string) => {
        bump(`resourceServers.list:${t}`);
        return { resource_servers: [] };
      },
    },
    promptSettings: {
      get: async (t: string) => {
        bump(`promptSettings.get:${t}`);
        return { x: 1 };
      },
    },
    hooks: {
      list: async (t: string) => {
        bump(`hooks.list:${t}`);
        return { hooks: [] };
      },
    },
  } as unknown as DataAdapters;
  return { upstream, calls };
}

function makeCtx(tenant_id?: string, client_id?: string) {
  return {
    var: { tenant_id, client_id },
    executionCtx: {
      waitUntil: () => {},
    },
  } as any;
}

describe("withClientBundle", () => {
  it("serves bundle-covered methods from a single upstream batch", async () => {
    const cache = makeCache();
    const { upstream, calls } = makeUpstream();
    const ctx = makeCtx("t1", "c1");
    const wrapped = withClientBundle(ctx, upstream, cache);

    // First call triggers bundle load (parallel fetch of all 8 components).
    await wrapped.tenants.get("t1");
    // Subsequent calls hit the in-memory bundle promise, no extra upstream calls.
    await wrapped.clients.get("t1", "c1");
    await wrapped.connections.list("t1");
    await wrapped.clientConnections.listByClient("t1", "c1");
    await wrapped.branding.get("t1");
    await wrapped.resourceServers.list("t1");
    await wrapped.promptSettings.get("t1");
    await wrapped.hooks.list("t1");

    // Each upstream method was called exactly once (during the bundle fetch).
    expect(calls["tenants.get:t1"]).toBe(1);
    expect(calls["clients.get:t1:c1"]).toBe(1);
    expect(calls["connections.list:t1"]).toBe(1);
    expect(calls["clientConnections.listByClient:t1:c1"]).toBe(1);
    expect(calls["branding.get:t1"]).toBe(1);
    expect(calls["resourceServers.list:t1"]).toBe(1);
    expect(calls["promptSettings.get:t1"]).toBe(1);
    expect(calls["hooks.list:t1"]).toBe(1);
  });

  it("falls through to upstream when tenant_id is not set on ctx", async () => {
    const cache = makeCache();
    const { upstream, calls } = makeUpstream();
    const ctx = makeCtx(undefined, undefined);
    const wrapped = withClientBundle(ctx, upstream, cache);

    const tenant = await wrapped.tenants.get("t1");
    expect(tenant).toEqual({ id: "t1", name: "tenant-t1" });
    expect(calls["tenants.get:t1"]).toBe(1);
    // Bundle was never fetched.
    expect(calls["clients.get:t1:c1"]).toBeUndefined();
  });

  it("falls through to upstream when client_id is not set on ctx", async () => {
    const cache = makeCache();
    const { upstream, calls } = makeUpstream();
    const ctx = makeCtx("t1", undefined);
    const wrapped = withClientBundle(ctx, upstream, cache);

    await wrapped.tenants.get("t1");
    expect(calls["tenants.get:t1"]).toBe(1);
    // Bundle was never fetched — no clients call.
    expect(calls["clients.get:t1:c1"]).toBeUndefined();
  });

  it("falls through to upstream when args don't match ctx.tenant_id", async () => {
    const cache = makeCache();
    const { upstream, calls } = makeUpstream();
    const ctx = makeCtx("t1", "c1");
    const wrapped = withClientBundle(ctx, upstream, cache);

    const tenant = await wrapped.tenants.get("other-tenant");
    expect(tenant).toEqual({ id: "other-tenant", name: "tenant-other-tenant" });
    expect(calls["tenants.get:other-tenant"]).toBe(1);
    // Bundle never loaded — no other entity calls.
    expect(calls["clients.get:t1:c1"]).toBeUndefined();
  });

  it("falls through when connections.list is called with pagination params", async () => {
    const cache = makeCache();
    const { upstream, calls } = makeUpstream();
    const ctx = makeCtx("t1", "c1");
    const wrapped = withClientBundle(ctx, upstream, cache);

    await wrapped.connections.list("t1", { per_page: 50 } as never);
    expect(calls["connections.list:t1"]).toBe(1);
    // Bundle was not loaded.
    expect(calls["clients.get:t1:c1"]).toBeUndefined();
  });

  it("getByClientId synthesizes tenant_id from ctx when bundle has the client", async () => {
    const cache = makeCache();
    const { upstream } = makeUpstream();
    const ctx = makeCtx("t1", "c1");
    const wrapped = withClientBundle(ctx, upstream, cache);

    const client = await wrapped.clients.getByClientId("c1");
    expect(client).toEqual({
      client_id: "c1",
      name: "client-c1",
      tenant_id: "t1",
    });
  });

  it("only loads the bundle once per request even under concurrent reads", async () => {
    const cache = makeCache();
    const { upstream, calls } = makeUpstream();
    const ctx = makeCtx("t1", "c1");
    const wrapped = withClientBundle(ctx, upstream, cache);

    await Promise.all([
      wrapped.tenants.get("t1"),
      wrapped.clients.get("t1", "c1"),
      wrapped.connections.list("t1"),
      wrapped.branding.get("t1"),
    ]);

    expect(calls["tenants.get:t1"]).toBe(1);
    expect(calls["clients.get:t1:c1"]).toBe(1);
    expect(calls["connections.list:t1"]).toBe(1);
    expect(calls["branding.get:t1"]).toBe(1);
  });
});
