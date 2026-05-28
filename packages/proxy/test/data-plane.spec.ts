import { describe, it, expect, beforeEach, vi } from "vitest";
import { createProxyDataPlaneRouter } from "../src/data-plane/router";
import { ProxyDataAdapter, ResolvedHost } from "../src/adapter";
import { ProxyRoute, HandlerConfig } from "../src/types";

function route(partial: {
  id?: string;
  priority?: number;
  match?: ProxyRoute["match"];
  handlers: HandlerConfig[];
}): ProxyRoute {
  return {
    id: partial.id ?? "r",
    tenant_id: "t1",
    custom_domain_id: "cd1",
    priority: partial.priority ?? 100,
    match: partial.match ?? { path: "/*" },
    handlers: partial.handlers,
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
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
        routes: [
          route({
            match: { path: "/account/*" },
            handlers: [
              { type: "http", options: { upstream_url: "https://x" } },
            ],
          }),
        ],
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
            match: { path: "/account/*" },
            handlers: [
              {
                type: "http",
                options: { upstream_url: "https://account.vercel.app" },
              },
            ],
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
            match: { path: "/*" },
            handlers: [
              {
                type: "http",
                options: {
                  upstream_url: "https://authhero.example",
                  preserve_host: true,
                },
              },
            ],
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

  it("redirects via redirect terminal handler", async () => {
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            match: { path: "/old/*" },
            handlers: [
              {
                type: "redirect",
                options: { upstream_url: "https://new.example.com" },
              },
            ],
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
            match: { path: "/api/*" },
            handlers: [
              {
                type: "cors",
                options: {
                  origins: ["https://app.example"],
                  allow_methods: ["GET", "POST"],
                },
              },
              {
                type: "http",
                options: { upstream_url: "https://up.example" },
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
            match: { path: "/admin/*" },
            handlers: [
              {
                type: "basic_auth",
                options: { username: "u", password: "p" },
              },
              {
                type: "http",
                options: { upstream_url: "https://up.example" },
              },
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

  it("filters by request method", async () => {
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
            match: { path: "/api/*", methods: ["POST"] },
            handlers: [
              {
                type: "http",
                options: { upstream_url: "https://up.example" },
              },
            ],
          }),
        ],
      }),
    });
    const get = await app.request("https://customer.com/api/u", {
      method: "GET",
      headers: { host: "customer.com" },
    });
    expect(get.status).toBe(404);
    const post = await app.request("https://customer.com/api/u", {
      method: "POST",
      headers: { host: "customer.com" },
    });
    expect(post.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("filters by request header", async () => {
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
            match: { path: "/*", headers: { "x-api-version": "^v2$" } },
            handlers: [
              {
                type: "http",
                options: { upstream_url: "https://up.example" },
              },
            ],
          }),
        ],
      }),
    });
    const missing = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    expect(missing.status).toBe(404);
    const present = await app.request("https://customer.com/", {
      headers: { host: "customer.com", "x-api-version": "v2" },
    });
    expect(present.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a static body", async () => {
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            match: { path: "/healthz" },
            handlers: [
              {
                type: "static",
                options: { status: 200, json: { ok: true } },
              },
            ],
          }),
        ],
      }),
    });
    const res = await app.request("https://customer.com/healthz", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("dispatches via a service binding", async () => {
    const bindingFetch = vi.fn(async () => new Response("from binding"));
    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            match: { path: "/*" },
            handlers: [
              {
                type: "service_binding",
                options: { binding: "API2" },
              },
            ],
          }),
        ],
      }),
      bindings: { API2: { fetch: bindingFetch } },
    });
    const res = await app.request("https://customer.com/foo", {
      headers: { host: "customer.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("from binding");
    expect(bindingFetch).toHaveBeenCalledTimes(1);
  });

  it("rewrites Set-Cookie Domain from upstream host to request host", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "Set-Cookie": "sid=abc; Path=/; Domain=upstream.example.com; HttpOnly",
        },
      }),
    );

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            match: { path: "/*" },
            handlers: [
              {
                type: "rewrite_cookies",
                options: { upstream_host: "upstream.example.com" },
              },
              {
                type: "http",
                options: { upstream_url: "https://upstream.example.com" },
              },
            ],
          }),
        ],
      }),
      cacheTtlMs: 0,
    });

    const res = await app.request("https://customer.com/", {
      headers: { host: "customer.com" },
    });
    const cookie =
      res.headers.getSetCookie?.()[0] ?? res.headers.get("set-cookie");
    expect(cookie).toContain("Domain=customer.com");
    expect(cookie).not.toContain("Domain=upstream.example.com");
  });

  it("rewrites Location header on 3xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://upstream.example.com/dest" },
      }),
    );

    const app = createProxyDataPlaneRouter({
      data: makeAdapter({
        tenant_id: "t1",
        custom_domain_id: "cd1",
        domain: "customer.com",
        routes: [
          route({
            match: { path: "/*" },
            handlers: [
              {
                type: "rewrite_location",
                options: { upstream_origin: "https://upstream.example.com" },
              },
              {
                type: "http",
                options: { upstream_url: "https://upstream.example.com" },
              },
            ],
          }),
        ],
      }),
      cacheTtlMs: 0,
    });

    const res = await app.request("https://customer.com/foo", {
      headers: { host: "customer.com" },
      redirect: "manual",
    });
    expect(res.headers.get("location")).toBe("https://customer.com/dest");
  });
});
