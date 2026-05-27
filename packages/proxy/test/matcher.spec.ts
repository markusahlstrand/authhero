import { describe, it, expect } from "vitest";
import { matchRoute, matchesPattern } from "../src/data-plane/matcher";
import { ProxyRoute } from "../src/types";

function route(partial: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    id: "r1",
    tenant_id: "t1",
    custom_domain_id: "cd1",
    priority: 100,
    path_pattern: "/",
    upstream_type: "http",
    upstream_url: "https://example.com",
    preserve_host: false,
    middleware: [],
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    ...partial,
  };
}

describe("matchesPattern", () => {
  it("matches root for any path", () => {
    expect(matchesPattern("/", "/")).toBe(true);
    expect(matchesPattern("/", "/foo")).toBe(true);
    expect(matchesPattern("/*", "/foo/bar")).toBe(true);
  });

  it("matches prefix with /*", () => {
    expect(matchesPattern("/account/*", "/account")).toBe(true);
    expect(matchesPattern("/account/*", "/account/")).toBe(true);
    expect(matchesPattern("/account/*", "/account/settings")).toBe(true);
    expect(matchesPattern("/account/*", "/other")).toBe(false);
  });

  it("matches exact and child segments without /*", () => {
    expect(matchesPattern("/checkout", "/checkout")).toBe(true);
    expect(matchesPattern("/checkout", "/checkout/cart")).toBe(true);
    expect(matchesPattern("/checkout", "/checkoutx")).toBe(false);
  });
});

describe("matchRoute", () => {
  it("picks lowest priority first", () => {
    const routes = [
      route({ id: "fallback", priority: 200, path_pattern: "/" }),
      route({ id: "checkout", priority: 50, path_pattern: "/checkout/*" }),
    ];
    expect(matchRoute(routes, "/checkout/cart")?.id).toBe("checkout");
    expect(matchRoute(routes, "/")?.id).toBe("fallback");
  });

  it("returns null when no match", () => {
    const routes = [route({ path_pattern: "/account/*" })];
    expect(matchRoute(routes, "/other")).toBeNull();
  });

  it("breaks ties by created_at", () => {
    const routes = [
      route({
        id: "a",
        priority: 100,
        path_pattern: "/",
        created_at: "2026-05-26T00:00:02.000Z",
      }),
      route({
        id: "b",
        priority: 100,
        path_pattern: "/",
        created_at: "2026-05-26T00:00:01.000Z",
      }),
    ];
    expect(matchRoute(routes, "/")?.id).toBe("b");
  });
});
