import { describe, it, expect, vi } from "vitest";
import type { ResolvedHost } from "../adapter";
import {
  createKvProxyAdapter,
  buildKvHostKey,
  DEFAULT_KV_HOST_KEY_PREFIX,
  type KvNamespaceReader,
} from "./index";

const blob: ResolvedHost = {
  tenant_id: "t1",
  custom_domain_id: "cd1",
  domain: "login.example.com",
  routes: [],
};

function fakeKv(store: Record<string, unknown>): KvNamespaceReader & {
  get: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(async (key: string, _type: "json") => {
    return (store[key] ?? null) as never;
  });
  return { get };
}

describe("buildKvHostKey", () => {
  it("prefixes and lowercases the host", () => {
    expect(buildKvHostKey("p:", "Login.Example.COM")).toBe(
      "p:login.example.com",
    );
  });
});

describe("createKvProxyAdapter", () => {
  it("returns the parsed blob from KV using the prefixed, lowercased key", async () => {
    const key = buildKvHostKey(DEFAULT_KV_HOST_KEY_PREFIX, "login.example.com");
    const kv = fakeKv({ [key]: blob });
    const adapter = createKvProxyAdapter({ kv });

    const resolved = await adapter.resolveHost("Login.Example.com");

    expect(resolved).toEqual(blob);
    expect(kv.get).toHaveBeenCalledWith(key, "json");
  });

  it("returns null on a KV miss", async () => {
    const kv = fakeKv({});
    const adapter = createKvProxyAdapter({ kv });

    expect(await adapter.resolveHost("missing.example.com")).toBeNull();
  });

  it("honors a custom key prefix", async () => {
    const kv = fakeKv({ "custom:login.example.com": blob });
    const adapter = createKvProxyAdapter({ kv, keyPrefix: "custom:" });

    expect(await adapter.resolveHost("login.example.com")).toEqual(blob);
  });

  it("rejects when the KV read exceeds the timeout", async () => {
    const kv: KvNamespaceReader = {
      get: () => new Promise(() => {}),
    };
    const adapter = createKvProxyAdapter({ kv, timeoutMs: 10 });

    await expect(adapter.resolveHost("slow.example.com")).rejects.toThrow();
  });

  it("exposes a read-only proxyRoutes adapter", async () => {
    const kv = fakeKv({});
    const adapter = createKvProxyAdapter({ kv });

    await expect(
      adapter.proxyRoutes.create("t1", {
        custom_domain_id: "cd1",
        priority: 100,
        match: { path: "/*" },
        handlers: [{ type: "http", options: {} }],
      }),
    ).rejects.toThrow(/does not expose write access/);
    await expect(adapter.proxyRoutes.get("t1", "r1")).rejects.toThrow(
      /use resolveHost/,
    );
  });
});
