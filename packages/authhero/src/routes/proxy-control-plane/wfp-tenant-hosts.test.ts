import { describe, it, expect, vi } from "vitest";
import type {
  CreateTenantParams,
  Tenant,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import type { ResolvedHost } from "@authhero/proxy";
import { buildKvHostKey, DEFAULT_KV_HOST_KEY_PREFIX } from "@authhero/proxy";
import {
  composeHostResolvers,
  createWfpTenantHostResolver,
  isWfpSubdomainSafeTenantId,
  wfpTenantHost,
  wrapTenantsAdapterWithWfpKvPublish,
} from "./wfp-tenant-hosts";

const ISSUER_HOST = "token.example.com";

let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

function makeTenant(overrides: Partial<Tenant> & { id: string }): Tenant {
  return {
    friendly_name: overrides.id,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function fakeTenants(seed: Tenant[] = []) {
  const rows = new Map<string, Tenant>(seed.map((t) => [t.id, t]));
  const adapter: TenantsDataAdapter = {
    async create(params: CreateTenantParams) {
      const id = params.id ?? nextId("t");
      const row = makeTenant({ ...params, id });
      rows.set(id, row);
      return row;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async list() {
      return { tenants: [...rows.values()] };
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, ...patch });
    },
    async remove(id) {
      return rows.delete(id);
    },
  };
  return { adapter, rows };
}

function fakeKv() {
  const store = new Map<string, string>();
  const put = vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  });
  const del = vi.fn(async (key: string) => {
    store.delete(key);
  });
  return { kv: { put, delete: del }, store, put, delete: del };
}

const key = (host: string) => buildKvHostKey(DEFAULT_KV_HOST_KEY_PREFIX, host);

const readyWfpTenant = (id: string, overrides: Partial<Tenant> = {}) =>
  makeTenant({
    id,
    deployment_type: "wfp",
    provisioning_state: "ready",
    worker_script_name: `tenant-${id}-auth`,
    ...overrides,
  });

describe("wfpTenantHost", () => {
  it("derives the platform subdomain, normalized", () => {
    expect(wfpTenantHost("wpf", ISSUER_HOST)).toBe("wpf.token.example.com");
    expect(wfpTenantHost("WPF", "Token.Example.com:8443")).toBe(
      "wpf.token.example.com",
    );
  });
});

describe("isWfpSubdomainSafeTenantId", () => {
  it("accepts lowercase DNS labels", () => {
    expect(isWfpSubdomainSafeTenantId("wpf")).toBe(true);
    expect(isWfpSubdomainSafeTenantId("acme-2")).toBe(true);
    expect(isWfpSubdomainSafeTenantId("a")).toBe(true);
    expect(isWfpSubdomainSafeTenantId("a".repeat(63))).toBe(true);
  });

  it("rejects ids that cannot round-trip through a hostname", () => {
    expect(isWfpSubdomainSafeTenantId("WpF")).toBe(false); // mixed case
    expect(isWfpSubdomainSafeTenantId("a.b")).toBe(false); // dot
    expect(isWfpSubdomainSafeTenantId("-acme")).toBe(false); // leading hyphen
    expect(isWfpSubdomainSafeTenantId("acme-")).toBe(false); // trailing hyphen
    expect(isWfpSubdomainSafeTenantId("a_b")).toBe(false); // underscore
    expect(isWfpSubdomainSafeTenantId("")).toBe(false);
    expect(isWfpSubdomainSafeTenantId("a".repeat(64))).toBe(false); // too long
  });
});

describe("createWfpTenantHostResolver", () => {
  function resolver(seed: Tenant[]) {
    return createWfpTenantHostResolver({
      tenants: fakeTenants(seed).adapter,
      issuerHost: ISSUER_HOST,
    });
  }

  it("resolves a ready wfp tenant subdomain to a dispatch route", async () => {
    const resolve = resolver([readyWfpTenant("wpf")]);
    const hit = await resolve("wpf.token.example.com");

    expect(hit).toMatchObject({
      tenant_id: "wpf",
      domain: "wpf.token.example.com",
      custom_domain_id: "wpf.token.example.com",
    });
    expect(hit!.routes).toHaveLength(1);
    expect(hit!.routes[0]!.match).toEqual({ path: "/*" });
    expect(hit!.routes[0]!.handlers).toEqual([
      { type: "forwarded_headers", options: {} },
      {
        type: "dispatch_namespace",
        options: { binding: "DISPATCHER", script_name: "tenant-wpf-auth" },
      },
    ]);
  });

  it("normalizes port, case, and trailing dot on the incoming host", async () => {
    const resolve = resolver([readyWfpTenant("wpf")]);
    const hit = await resolve("WPF.Token.Example.com.:443");
    expect(hit?.tenant_id).toBe("wpf");
    expect(hit?.domain).toBe("wpf.token.example.com");
  });

  it("falls back to the script-name template when worker_script_name is unset", async () => {
    const seed = [readyWfpTenant("wpf", { worker_script_name: undefined })];
    const resolve = createWfpTenantHostResolver({
      tenants: fakeTenants(seed).adapter,
      issuerHost: ISSUER_HOST,
      scriptNameTemplate: "tenant-{tenant_id}-auth",
    });
    const hit = await resolve("wpf.token.example.com");
    expect(hit!.routes[0]!.handlers[1]!.options).toMatchObject({
      script_name: "tenant-wpf-auth",
    });
  });

  it("honors dispatchBinding and dispatchTimeoutMs overrides", async () => {
    const resolve = createWfpTenantHostResolver({
      tenants: fakeTenants([readyWfpTenant("wpf")]).adapter,
      issuerHost: ISSUER_HOST,
      dispatchBinding: "TENANTS",
      dispatchTimeoutMs: 10_000,
    });
    const hit = await resolve("wpf.token.example.com");
    expect(hit!.routes[0]!.handlers[1]!.options).toEqual({
      binding: "TENANTS",
      script_name: "tenant-wpf-auth",
      timeout_ms: 10_000,
    });
  });

  it("returns null while the tenant is still provisioning", async () => {
    const resolve = resolver([
      readyWfpTenant("wpf", { provisioning_state: "pending" }),
    ]);
    expect(await resolve("wpf.token.example.com")).toBeNull();
  });

  it("returns null for shared tenants, unknown tenants, and non-subdomain hosts", async () => {
    const resolve = resolver([
      makeTenant({ id: "shared-tenant" }), // deployment_type defaults to shared
      readyWfpTenant("wpf"),
    ]);
    expect(await resolve("shared-tenant.token.example.com")).toBeNull();
    expect(await resolve("nope.token.example.com")).toBeNull();
    expect(await resolve("token.example.com")).toBeNull(); // bare issuer host
    expect(await resolve("a.wpf.token.example.com")).toBeNull(); // two labels
    expect(await resolve("wpf.other.example.com")).toBeNull();
    // suffix match must be label-aligned, not substring
    expect(await resolve("evil-token.example.com")).toBeNull();
  });
});

describe("composeHostResolvers", () => {
  it("returns the first non-null hit in order", async () => {
    const a = vi.fn(async () => null);
    const hit = { tenant_id: "t", custom_domain_id: "c", domain: "d", routes: [] };
    const b = vi.fn(async () => hit as ResolvedHost);
    const c = vi.fn(async () => {
      throw new Error("unreachable");
    });

    const resolve = composeHostResolvers(a, b, c);
    expect(await resolve("d")).toBe(hit);
    expect(a).toHaveBeenCalledWith("d");
    expect(c).not.toHaveBeenCalled();
  });

  it("propagates errors instead of treating them as misses", async () => {
    const boom = vi.fn(async () => {
      throw new Error("layer down");
    });
    const resolve = composeHostResolvers(boom);
    await expect(resolve("d")).rejects.toThrow("layer down");
  });
});

function setupWrapped(seed: Tenant[] = []) {
  const t = fakeTenants(seed);
  const kvh = fakeKv();
  const pending: Promise<unknown>[] = [];
  const onError = vi.fn();
  const resolveHost = composeHostResolvers(
    createWfpTenantHostResolver({
      tenants: t.adapter,
      issuerHost: ISSUER_HOST,
    }),
  );
  const wrapped = wrapTenantsAdapterWithWfpKvPublish({
    tenants: t.adapter,
    kv: kvh.kv,
    resolveHost,
    issuerHost: ISSUER_HOST,
    waitUntil: (p) => pending.push(p),
    onError,
  });
  const flush = () => Promise.all(pending);
  return { t, kvh, wrapped, flush, onError };
}

describe("wrapTenantsAdapterWithWfpKvPublish", () => {
  it("publishes the dispatch blob when the provisioner flips the tenant to ready", async () => {
    const s = setupWrapped();
    await s.wrapped.create({ friendly_name: "WPF", id: "wpf" });
    await s.flush();
    // Created without wfp fields → shared → no KV traffic at all.
    expect(s.kvh.put).not.toHaveBeenCalled();
    expect(s.kvh.delete).not.toHaveBeenCalled();

    await s.wrapped.update("wpf", {
      deployment_type: "wfp",
      provisioning_state: "pending",
    });
    await s.flush();
    // wfp but not ready → blob resolves null → key deleted (no-op here).
    expect(s.kvh.put).not.toHaveBeenCalled();

    // The provisioner's write-back, as done by createWfpTenantProvisioningHook.
    await s.wrapped.update("wpf", {
      provisioning_state: "ready",
      worker_script_name: "tenant-wpf-auth",
    });
    await s.flush();

    const stored = s.kvh.store.get(key("wpf.token.example.com"));
    expect(stored).toBeDefined();
    const blob = JSON.parse(stored!) as ResolvedHost;
    expect(blob.tenant_id).toBe("wpf");
    expect(blob.routes[0]!.handlers[1]).toMatchObject({
      type: "dispatch_namespace",
      options: { script_name: "tenant-wpf-auth" },
    });
  });

  it("publishes on create when the row is born wfp+ready", async () => {
    const s = setupWrapped();
    await s.wrapped.create({
      friendly_name: "WPF",
      id: "wpf",
      deployment_type: "wfp",
      provisioning_state: "ready",
      worker_script_name: "tenant-wpf-auth",
    });
    await s.flush();
    expect(s.kvh.store.has(key("wpf.token.example.com"))).toBe(true);
  });

  it("deletes the key on remove", async () => {
    const s = setupWrapped([readyWfpTenant("wpf")]);
    // Seed KV as if previously published.
    await s.kvh.kv.put(key("wpf.token.example.com"), "{}");
    s.kvh.put.mockClear();

    const ok = await s.wrapped.remove("wpf");
    await s.flush();

    expect(ok).toBe(true);
    expect(s.kvh.delete).toHaveBeenCalledWith(key("wpf.token.example.com"));
    expect(s.kvh.store.has(key("wpf.token.example.com"))).toBe(false);
  });

  it("deletes the key on a wfp → shared flip", async () => {
    const s = setupWrapped([readyWfpTenant("wpf")]);
    await s.kvh.kv.put(key("wpf.token.example.com"), "{}");

    await s.wrapped.update("wpf", { deployment_type: "shared" });
    await s.flush();

    expect(s.kvh.delete).toHaveBeenCalledWith(key("wpf.token.example.com"));
  });

  it("skips wfp tenants whose id is not a lowercase DNS label", async () => {
    const s = setupWrapped();
    await s.wrapped.create({
      friendly_name: "Mixed",
      id: "WpF",
      deployment_type: "wfp",
      provisioning_state: "ready",
      worker_script_name: "tenant-WpF-auth",
    });
    await s.wrapped.update("WpF", { friendly_name: "renamed" });
    const ok = await s.wrapped.remove("WpF");
    await s.flush();

    expect(ok).toBe(true);
    expect(s.kvh.put).not.toHaveBeenCalled();
    expect(s.kvh.delete).not.toHaveBeenCalled();
  });

  it("ignores shared tenants entirely", async () => {
    const s = setupWrapped([makeTenant({ id: "shared-tenant" })]);
    await s.wrapped.update("shared-tenant", { friendly_name: "renamed" });
    const ok = await s.wrapped.remove("shared-tenant");
    await s.flush();

    expect(ok).toBe(true);
    expect(s.kvh.put).not.toHaveBeenCalled();
    expect(s.kvh.delete).not.toHaveBeenCalled();
  });

  it("never fails the write when publishing throws; routes to onError", async () => {
    const t = fakeTenants([readyWfpTenant("wpf")]);
    const pending: Promise<unknown>[] = [];
    const onError = vi.fn();
    const wrapped = wrapTenantsAdapterWithWfpKvPublish({
      tenants: t.adapter,
      kv: fakeKv().kv,
      resolveHost: async () => {
        throw new Error("resolve boom");
      },
      issuerHost: ISSUER_HOST,
      waitUntil: (p) => pending.push(p),
      onError,
    });

    await wrapped.update("wpf", { friendly_name: "still works" });
    await Promise.all(pending);

    expect((await t.adapter.get("wpf"))?.friendly_name).toBe("still works");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      host: "wpf.token.example.com",
      op: "tenant.update",
    });
  });
});
