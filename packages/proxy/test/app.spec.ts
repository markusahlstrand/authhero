import { describe, it, expect, vi } from "vitest";
import { createProxyApp } from "../src/app";
import { ProxyDataAdapter, ResolvedHost } from "../src/adapter";
import { ProxyRoute } from "../src/types";

function route(partial: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    id: "r",
    tenant_id: "t1",
    custom_domain_id: "cd1",
    priority: 100,
    match: { path: "/*" },
    handlers: [
      {
        type: "http",
        options: { upstream_url: "https://upstream.example.com" },
      },
    ],
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

describe("createProxyApp", () => {
  it("serves data plane on /* by default", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const app = createProxyApp({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [route()],
      }),
      cacheTtlMs: 0,
    });
    const res = await app.request("https://customer.com/anything", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when the Host header is missing", async () => {
    const app = createProxyApp({ data: makeAdapter(null) });
    const res = await app.request("https://customer.com/__proxy/routes", {});
    expect(res.status).toBe(400);
  });
});
