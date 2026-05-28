import { describe, it, expect } from "vitest";
import {
  matchesHost,
  matchesAnyHost,
  sortRoutes,
} from "../src/data-plane/matcher";
import { ProxyRoute } from "../src/types";

function route(partial: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    id: "r1",
    tenant_id: "t1",
    custom_domain_id: "cd1",
    priority: 100,
    match: { path: "/*" },
    handlers: [
      { type: "http", options: { upstream_url: "https://example.com" } },
    ],
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    ...partial,
  };
}

describe("matchesHost", () => {
  it("matches exact", () => {
    expect(matchesHost("api.example.com", "api.example.com")).toBe(true);
    expect(matchesHost("api.example.com", "API.EXAMPLE.COM")).toBe(true);
    expect(matchesHost("api.example.com", "other.example.com")).toBe(false);
  });

  it("matches wildcard subdomain", () => {
    expect(matchesHost("*.example.com", "foo.example.com")).toBe(true);
    expect(matchesHost("*.example.com", "bar.baz.example.com")).toBe(true);
    expect(matchesHost("*.example.com", "example.com")).toBe(false);
  });
});

describe("matchesAnyHost", () => {
  it("matches when patterns absent or empty", () => {
    expect(matchesAnyHost(undefined, "anything.com")).toBe(true);
    expect(matchesAnyHost([], "anything.com")).toBe(true);
  });
  it("matches when any pattern matches", () => {
    expect(matchesAnyHost(["*.example.com", "api.foo.com"], "api.foo.com"))
      .toBe(true);
    expect(matchesAnyHost(["*.example.com", "api.foo.com"], "other.com"))
      .toBe(false);
  });
});

describe("sortRoutes", () => {
  it("orders by priority then created_at", () => {
    const routes = [
      route({ id: "a", priority: 100, created_at: "2026-05-26T00:00:02.000Z" }),
      route({ id: "b", priority: 100, created_at: "2026-05-26T00:00:01.000Z" }),
      route({ id: "c", priority: 50, created_at: "2026-05-26T00:00:03.000Z" }),
    ];
    expect(sortRoutes(routes).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
