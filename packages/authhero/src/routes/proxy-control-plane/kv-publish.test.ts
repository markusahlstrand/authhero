import { describe, it, expect, vi } from "vitest";
import type {
  CustomDomain,
  CustomDomainInsert,
  CustomDomainsAdapter,
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import type { ResolvedHost } from "@authhero/proxy";
import { buildKvHostKey, DEFAULT_KV_HOST_KEY_PREFIX } from "@authhero/proxy";
import {
  wrapProxyAdaptersWithKvPublish,
  backfillProxyHostsToKv,
} from "./kv-publish";
import { createApplySyncEvents } from "./index";

let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

function fakeCustomDomains() {
  const rows = new Map<string, CustomDomain & { tenant_id: string }>();
  const adapter: CustomDomainsAdapter = {
    async create(tenant_id, insert: CustomDomainInsert) {
      const custom_domain_id = insert.custom_domain_id ?? nextId("cd");
      const row: CustomDomain & { tenant_id: string } = {
        ...insert,
        custom_domain_id,
        tenant_id,
        primary: false,
        status: "ready",
      };
      rows.set(custom_domain_id, row);
      return row;
    },
    async get(tenant_id, id) {
      const row = rows.get(id);
      return row && row.tenant_id === tenant_id ? row : null;
    },
    async getByDomain(domain) {
      for (const row of rows.values()) {
        if (row.domain === domain) return row;
      }
      return null;
    },
    async list(tenant_id) {
      return [...rows.values()].filter((r) => r.tenant_id === tenant_id);
    },
    async update(tenant_id, id, patch) {
      const row = rows.get(id);
      if (!row || row.tenant_id !== tenant_id) return false;
      rows.set(id, { ...row, ...patch });
      return true;
    },
    async remove(tenant_id, id) {
      const row = rows.get(id);
      if (!row || row.tenant_id !== tenant_id) return false;
      rows.delete(id);
      return true;
    },
  };
  return { adapter, rows };
}

function fakeProxyRoutes() {
  const rows = new Map<string, ProxyRoute>();
  const adapter: ProxyRoutesAdapter = {
    async create(tenant_id, insert: ProxyRouteInsert) {
      const id = insert.id ?? nextId("r");
      const row: ProxyRoute = {
        id,
        tenant_id,
        custom_domain_id: insert.custom_domain_id,
        priority: insert.priority ?? 100,
        match: insert.match,
        handlers: insert.handlers,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
      rows.set(id, row);
      return row;
    },
    async get(tenant_id, id) {
      const row = rows.get(id);
      return row && row.tenant_id === tenant_id ? row : null;
    },
    async list(tenant_id, params) {
      const all = [...rows.values()].filter(
        (r) =>
          r.tenant_id === tenant_id &&
          (!params?.custom_domain_id ||
            r.custom_domain_id === params.custom_domain_id),
      );
      return {
        proxy_routes: all,
        start: 0,
        limit: all.length,
        length: all.length,
      };
    },
    async update(tenant_id, id, patch) {
      const row = rows.get(id);
      if (!row || row.tenant_id !== tenant_id) return false;
      rows.set(id, { ...row, ...patch });
      return true;
    },
    async remove(tenant_id, id) {
      const row = rows.get(id);
      if (!row || row.tenant_id !== tenant_id) return false;
      rows.delete(id);
      return true;
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

// resolveHost recomputed from the live fakes — mirrors resolveHostFromDrizzle.
function makeResolveHost(
  customDomains: ReturnType<typeof fakeCustomDomains>,
  proxyRoutes: ReturnType<typeof fakeProxyRoutes>,
) {
  return async (host: string): Promise<ResolvedHost | null> => {
    let domain: (CustomDomain & { tenant_id: string }) | undefined;
    for (const row of customDomains.rows.values()) {
      if (row.domain === host.toLowerCase()) {
        domain = row;
        break;
      }
    }
    if (!domain) return null;
    const routes = [...proxyRoutes.rows.values()].filter(
      (r) =>
        r.tenant_id === domain!.tenant_id &&
        r.custom_domain_id === domain!.custom_domain_id,
    );
    return {
      tenant_id: domain.tenant_id,
      custom_domain_id: domain.custom_domain_id,
      domain: domain.domain,
      routes,
    };
  };
}

function setup() {
  const cd = fakeCustomDomains();
  const pr = fakeProxyRoutes();
  const kvh = fakeKv();
  const resolveHost = makeResolveHost(cd, pr);
  const pending: Promise<unknown>[] = [];
  const onError = vi.fn();
  const wrapped = wrapProxyAdaptersWithKvPublish({
    customDomains: cd.adapter,
    proxyRoutes: pr.adapter,
    kv: kvh.kv,
    resolveHost,
    waitUntil: (p) => pending.push(p),
    onError,
  });
  const flush = () => Promise.all(pending);
  const key = (host: string) => buildKvHostKey(DEFAULT_KV_HOST_KEY_PREFIX, host);
  return { cd, pr, kvh, resolveHost, wrapped, flush, key, onError };
}

const insert = (domain: string): CustomDomainInsert => ({
  domain,
  type: "auth0_managed_certs",
});

describe("wrapProxyAdaptersWithKvPublish — custom domains", () => {
  it("publishes the recomputed blob on create", async () => {
    const t = setup();
    const created = await t.wrapped.customDomains.create("t1", insert("a.com"));
    await t.flush();

    expect(t.kvh.put).toHaveBeenCalledTimes(1);
    const [k, v] = t.kvh.put.mock.calls[0]!;
    expect(k).toBe(t.key("a.com"));
    expect(JSON.parse(v)).toMatchObject({
      domain: "a.com",
      custom_domain_id: created.custom_domain_id,
      routes: [],
    });
  });

  it("deletes the KV key on remove (blob recomputes to null)", async () => {
    const t = setup();
    const created = await t.wrapped.customDomains.create("t1", insert("a.com"));
    await t.flush();
    t.kvh.put.mockClear();

    const ok = await t.wrapped.customDomains.remove(
      "t1",
      created.custom_domain_id,
    );
    await t.flush();

    expect(ok).toBe(true);
    expect(t.kvh.delete).toHaveBeenCalledWith(t.key("a.com"));
  });

  it("drops the stale key when a domain is renamed", async () => {
    const t = setup();
    const created = await t.wrapped.customDomains.create("t1", insert("a.com"));
    await t.flush();
    t.kvh.put.mockClear();

    await t.wrapped.customDomains.update("t1", created.custom_domain_id, {
      domain: "b.com",
    });
    await t.flush();

    // old host deleted (recomputes to null), new host published
    expect(t.kvh.delete).toHaveBeenCalledWith(t.key("a.com"));
    expect(t.kvh.put).toHaveBeenCalledWith(t.key("b.com"), expect.any(String));
  });
});

describe("wrapProxyAdaptersWithKvPublish — proxy routes", () => {
  it("republishes the whole host blob on route create/update/remove", async () => {
    const t = setup();
    const cd = await t.wrapped.customDomains.create("t1", insert("a.com"));
    await t.flush();
    t.kvh.put.mockClear();

    const route = await t.wrapped.proxyRoutes.create("t1", {
      custom_domain_id: cd.custom_domain_id,
      priority: 100,
      match: { path: "/*" },
      handlers: [{ type: "http", options: {} }],
    });
    await t.flush();

    let v = t.kvh.put.mock.calls.at(-1)![1];
    expect(JSON.parse(v).routes).toHaveLength(1);

    t.kvh.put.mockClear();
    await t.wrapped.proxyRoutes.update("t1", route.id, { priority: 5 });
    await t.flush();
    v = t.kvh.put.mock.calls.at(-1)![1];
    expect(JSON.parse(v).routes[0].priority).toBe(5);

    t.kvh.put.mockClear();
    await t.wrapped.proxyRoutes.remove("t1", route.id);
    await t.flush();
    v = t.kvh.put.mock.calls.at(-1)![1];
    expect(JSON.parse(v).routes).toHaveLength(0);
  });
});

describe("wrapProxyAdaptersWithKvPublish — resilience", () => {
  it("does not fail the write when publishing throws, routes to onError", async () => {
    const cd = fakeCustomDomains();
    const pr = fakeProxyRoutes();
    const resolveHost = vi.fn(async () => {
      throw new Error("resolve boom");
    });
    const pending: Promise<unknown>[] = [];
    const onError = vi.fn();
    const wrapped = wrapProxyAdaptersWithKvPublish({
      customDomains: cd.adapter,
      proxyRoutes: pr.adapter,
      kv: fakeKv().kv,
      resolveHost,
      waitUntil: (p) => pending.push(p),
      onError,
    });

    const created = await wrapped.customDomains.create("t1", insert("a.com"));
    await Promise.all(pending);

    expect(created.domain).toBe("a.com");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      host: "a.com",
      op: "custom_domain.create",
    });
  });
});

describe("createApplySyncEvents against wrapped adapters", () => {
  it("publishes to KV on a /sync-applied custom_domain + proxy_route write", async () => {
    const t = setup();
    const apply = createApplySyncEvents({
      customDomains: t.wrapped.customDomains,
      proxyRoutes: t.wrapped.proxyRoutes,
    });

    await apply([
      {
        event_id: "e1",
        tenant_id: "t1",
        entity: "custom_domain",
        op: "created",
        aggregate_id: "cd-sync",
        payload: {
          domain: "synced.com",
          custom_domain_id: "cd-sync",
          type: "auth0_managed_certs",
          primary: false,
          status: "ready",
        },
        occurred_at: "2026-01-01T00:00:00.000Z",
      },
      {
        event_id: "e2",
        tenant_id: "t1",
        entity: "proxy_route",
        op: "created",
        aggregate_id: "r-sync",
        payload: {
          id: "r-sync",
          tenant_id: "t1",
          custom_domain_id: "cd-sync",
          priority: 100,
          match: { path: "/*" },
          handlers: [{ type: "http", options: {} }],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        occurred_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await t.flush();

    const stored = t.kvh.store.get(t.key("synced.com"));
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!).routes).toHaveLength(1);
  });
});

describe("backfillProxyHostsToKv", () => {
  it("publishes resolvable hosts, deletes unresolvable ones, reports counts", async () => {
    const cd = fakeCustomDomains();
    const pr = fakeProxyRoutes();
    await cd.adapter.create("t1", insert("a.com"));
    await cd.adapter.create("t1", insert("b.com"));
    const resolveHost = makeResolveHost(cd, pr);
    const kvh = fakeKv();

    const result = await backfillProxyHostsToKv({
      hosts: ["a.com", "b.com", "gone.com"],
      resolveHost,
      kv: kvh.kv,
    });

    expect(result.published).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.failed).toEqual([]);
    expect(kvh.store.has(buildKvHostKey(DEFAULT_KV_HOST_KEY_PREFIX, "a.com"))).toBe(
      true,
    );
  });

  it("collects hosts that throw into failed", async () => {
    const resolveHost = vi.fn(async (host: string) => {
      if (host === "bad.com") throw new Error("boom");
      return null;
    });
    const kvh = fakeKv();

    const result = await backfillProxyHostsToKv({
      hosts: ["bad.com"],
      resolveHost,
      kv: kvh.kv,
    });

    expect(result.failed).toEqual(["bad.com"]);
  });
});
