import { describe, it, expect, beforeEach } from "vitest";
import type { MiddlewareHandler } from "hono";
import { createProxyManagementRouter } from "../src/management/router";
import { ProxyDataAdapter } from "../src/adapter";
import { ProxyRoute } from "../src/types";

function makeAdapter(): ProxyDataAdapter {
  const store = new Map<string, ProxyRoute>();
  return {
    proxyRoutes: {
      async create(tenant_id, input) {
        const id = `r${store.size + 1}`;
        const now = new Date().toISOString();
        const route: ProxyRoute = {
          id,
          tenant_id,
          ...input,
          created_at: now,
          updated_at: now,
        };
        store.set(id, route);
        return route;
      },
      async get(tenant_id, id) {
        const r = store.get(id);
        return r && r.tenant_id === tenant_id ? r : null;
      },
      async list(tenant_id) {
        const items = [...store.values()].filter(
          (r) => r.tenant_id === tenant_id,
        );
        return {
          proxy_routes: items,
          start: 0,
          limit: 50,
          length: items.length,
        };
      },
      async update(tenant_id, id, patch) {
        const r = store.get(id);
        if (!r || r.tenant_id !== tenant_id) return false;
        store.set(id, {
          ...r,
          ...patch,
          updated_at: new Date().toISOString(),
        } as ProxyRoute);
        return true;
      },
      async remove(tenant_id, id) {
        const r = store.get(id);
        if (!r || r.tenant_id !== tenant_id) return false;
        store.delete(id);
        return true;
      },
    },
    resolveHost: async () => null,
  };
}

const setTenant =
  (tenantId: string): MiddlewareHandler<{ Variables: { tenant_id: string } }> =>
  async (c, next) => {
    c.set("tenant_id", tenantId);
    await next();
  };

describe("management router", () => {
  let data: ProxyDataAdapter;
  beforeEach(() => {
    data = makeAdapter();
  });

  it("returns 401 when no auth context is set", async () => {
    const app = createProxyManagementRouter({ data });
    const res = await app.request("/", {});
    expect(res.status).toBe(401);
  });

  it("creates and lists routes scoped to tenant", async () => {
    const app = createProxyManagementRouter({
      data,
      auth: setTenant("tenant-a"),
    });

    const createRes = await app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        custom_domain_id: "cd1",
        priority: 100,
        path_pattern: "/account/*",
        upstream_type: "http",
        upstream_url: "https://account.vercel.app",
        preserve_host: false,
        middleware: [],
      }),
    });
    expect(createRes.status).toBe(201);

    const listRes = await app.request("/", {});
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { length: number };
    expect(body.length).toBe(1);
  });

  it("isolates tenants", async () => {
    const appA = createProxyManagementRouter({
      data,
      auth: setTenant("tenant-a"),
    });
    const appB = createProxyManagementRouter({
      data,
      auth: setTenant("tenant-b"),
    });

    await appA.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        custom_domain_id: "cd1",
        priority: 100,
        path_pattern: "/",
        upstream_type: "http",
        upstream_url: "https://x.example",
        preserve_host: false,
        middleware: [],
      }),
    });

    const bList = (await (
      await appB.request("/", {})
    ).json()) as { length: number };
    expect(bList.length).toBe(0);
  });

  it("returns 404 for missing route", async () => {
    const app = createProxyManagementRouter({
      data,
      auth: setTenant("tenant-a"),
    });
    const res = await app.request("/does-not-exist", {});
    expect(res.status).toBe(404);
  });
});
