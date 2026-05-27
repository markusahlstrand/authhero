import { describe, it, expect, vi, afterEach } from "vitest";
import { createStaticProxyAdapter } from "../src/static";
import { createProxyApp } from "../src/app";

describe("static proxy adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a host configured at init", async () => {
    const adapter = createStaticProxyAdapter({
      hosts: {
        "id.ahlstrand.es": {
          tenant_id: "ahlstrand",
          routes: [
            {
              path_pattern: "/*",
              upstream_type: "http",
              upstream_url: "https://auth.example",
            },
          ],
        },
      },
    });

    const resolved = await adapter.resolveHost("id.ahlstrand.es");
    expect(resolved?.tenant_id).toBe("ahlstrand");
    expect(resolved?.routes).toHaveLength(1);
    expect(resolved?.routes[0]?.upstream_url).toBe("https://auth.example");
  });

  it("normalizes host case", async () => {
    const adapter = createStaticProxyAdapter({
      hosts: {
        "Example.COM": {
          routes: [
            {
              path_pattern: "/*",
              upstream_type: "http",
              upstream_url: "https://x.example",
            },
          ],
        },
      },
    });
    const resolved = await adapter.resolveHost("EXAMPLE.com");
    expect(resolved?.domain).toBe("example.com");
  });

  it("returns null for unknown hosts", async () => {
    const adapter = createStaticProxyAdapter({ hosts: {} });
    expect(await adapter.resolveHost("missing")).toBeNull();
  });

  it("accepts routes-array shorthand", async () => {
    const adapter = createStaticProxyAdapter({
      hosts: {
        "x.example": [
          {
            path_pattern: "/*",
            upstream_type: "http",
            upstream_url: "https://up.example",
          },
        ],
      },
    });
    const resolved = await adapter.resolveHost("x.example");
    expect(resolved?.routes).toHaveLength(1);
  });

  it("throws on write operations", async () => {
    const adapter = createStaticProxyAdapter({ hosts: {} });
    await expect(
      adapter.proxyRoutes.create("t", {
        custom_domain_id: "cd",
        priority: 100,
        path_pattern: "/*",
        upstream_type: "http",
        upstream_url: "https://x",
        preserve_host: false,
        middleware: [],
      }),
    ).rejects.toThrow(/read-only/);
  });

  it("wires into createProxyApp and dispatches a request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("hi", { status: 200 }));

    const app = createProxyApp({
      data: createStaticProxyAdapter({
        hosts: {
          "id.ahlstrand.es": [
            {
              path_pattern: "/*",
              upstream_type: "http",
              upstream_url: "https://auth.example",
            },
          ],
        },
      }),
    });

    const res = await app.request("https://id.ahlstrand.es/login", {
      headers: { host: "id.ahlstrand.es" },
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://auth.example/login");
  });
});
