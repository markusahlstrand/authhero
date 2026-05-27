import { describe, it, expect, vi } from "vitest";
import type { MiddlewareHandler } from "hono";
import { createProxyApp } from "../src/app";
import { ProxyDataAdapter, ResolvedHost } from "../src/adapter";
import { ProxyRoute } from "../src/types";

function route(partial: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    id: "r",
    tenant_id: "t1",
    custom_domain_id: "cd1",
    priority: 100,
    path_pattern: "/",
    upstream_type: "http",
    upstream_url: "https://upstream.example.com",
    preserve_host: false,
    middleware: [],
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    ...partial,
  };
}

function makeAdapter(resolved: ResolvedHost | null): ProxyDataAdapter {
  return {
    proxyRoutes: {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockResolvedValue({
        proxy_routes: [],
        start: 0,
        limit: 50,
        length: 0,
      }),
      update: vi.fn(),
      remove: vi.fn(),
    },
    resolveHost: async () => resolved,
  };
}

const setTenant =
  (tenantId: string): MiddlewareHandler<{ Variables: { tenant_id: string } }> =>
  async (c, next) => {
    c.set("tenant_id", tenantId);
    await next();
  };

describe("createProxyApp", () => {
  it("serves data plane on /* by default", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const app = createProxyApp({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [route({ path_pattern: "/" })],
      }),
      cacheTtlMs: 0,
    });
    const res = await app.request("https://customer.com/anything", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(200);
  });

  it("does not mount the management API when management is omitted", async () => {
    const app = createProxyApp({ data: makeAdapter(null) });
    // No host -> data plane returns 400; if management were mounted at the
    // default path, this request would be routed there instead.
    const res = await app.request("https://customer.com/__proxy/routes", {});
    // The data plane catch-all responds 400 for missing host.
    expect(res.status).toBe(400);
  });

  it("mounts the management API at the default path when configured", async () => {
    const app = createProxyApp({
      data: makeAdapter(null),
      management: { auth: setTenant("t1") },
    });
    const res = await app.request("https://customer.com/__proxy/routes", {});
    expect(res.status).toBe(200);
  });

  it("respects a custom management path", async () => {
    const app = createProxyApp({
      data: makeAdapter(null),
      management: { path: "/admin/proxy", auth: setTenant("t1") },
    });
    const res = await app.request("https://customer.com/admin/proxy", {});
    expect(res.status).toBe(200);
  });
});
