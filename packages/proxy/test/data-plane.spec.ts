import { describe, it, expect, beforeEach, vi } from "vitest";
import { createProxyDataPlaneRouter } from "../src/data-plane/router";
import { ProxyDataAdapter, ResolvedHost } from "../src/adapter";
import { ProxyRoute } from "../src/types";

function route(partial: Partial<ProxyRoute>): ProxyRoute {
  return {
    id: partial.id ?? "r",
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
    proxyRoutes: {} as ProxyDataAdapter["proxyRoutes"],
    resolveHost: async () => resolved,
  };
}

describe("data plane router", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 for unknown host", async () => {
    const app = createProxyDataPlaneRouter({ data: makeAdapter(null) });
    const res = await app.request("https://unknown.example/", {
      headers: { host: "unknown.example" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when no route matches the path", async () => {
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [route({ path_pattern: "/account/*" })],
      }),
    });
    const res = await app.request("https://customer.com/checkout", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(404);
  });

  it("dispatches to http upstream with rewritten host", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            path_pattern: "/account/*",
            upstream_url: "https://account.vercel.app",
          }),
        ],
      }),
      cacheTtlMs: 0,
    });

    const res = await app.request("https://customer.com/account/settings", {
      headers: { host: "customer.com" },
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toBe("https://account.vercel.app/account/settings");
    const calledInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((calledInit.headers as Headers).get("host")).toBe(
      "account.vercel.app",
    );
    expect((calledInit.headers as Headers).get("x-forwarded-host")).toBe(
      "customer.com",
    );
  });

  it("preserves host when configured", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok"));

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            path_pattern: "/",
            upstream_url: "https://authhero.example",
            preserve_host: true,
          }),
        ],
      }),
      cacheTtlMs: 0,
    });

    await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });

    const calledInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((calledInit.headers as Headers).get("host")).toBe("customer.com");
  });

  it("redirects when route type is redirect", async () => {
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            path_pattern: "/old/*",
            upstream_type: "redirect",
            upstream_url: "https://new.example.com",
          }),
        ],
      }),
    });
    const res = await app.request("https://customer.com/old/page", {
      headers: { host: "customer.com" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://new.example.com/old/page",
    );
  });

  it("returns CORS preflight without hitting upstream", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            path_pattern: "/api/*",
            middleware: [
              {
                type: "cors",
                origins: ["https://app.example"],
                allow_methods: ["GET", "POST"],
              },
            ],
          }),
        ],
      }),
    });
    const res = await app.request("https://customer.com/api/users", {
      method: "OPTIONS",
      headers: {
        host: "customer.com",
        origin: "https://app.example",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unauthorized basic_auth request", async () => {
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            path_pattern: "/admin/*",
            middleware: [
              { type: "basic_auth", username: "u", password: "p" },
            ],
          }),
        ],
      }),
    });
    const res = await app.request("https://customer.com/admin/x", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });
});
