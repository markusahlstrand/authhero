import { describe, it, expect, vi } from "vitest";
import type {
  CustomDomain,
  CustomDomainsAdapter,
  ProxyRoute,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import { PROXY_RESOLVE_HOST_SCOPE } from "@authhero/proxy";
import {
  createApplySyncEvents,
  createProxyControlPlaneApp,
} from "../../../src/routes/proxy-control-plane";
import type { SyncEvent } from "../../../src/helpers/control-plane-sync-events";
import { createTestKeyset, type TestKeyset } from "./jwt-fixture";

const ISSUER = "https://issuer.example.test/";

async function bearer(
  keyset: TestKeyset,
  overrides: { scope?: string; iss?: string } = {},
): Promise<string> {
  const token = await keyset.sign({
    payload: {
      iss: overrides.iss ?? ISSUER,
      sub: "client-proxy",
      scope: overrides.scope ?? PROXY_RESOLVE_HOST_SCOPE,
    },
  });
  return `Bearer ${token}`;
}

function envWithIssuer(): { ISSUER: string } {
  return { ISSUER };
}

function customDomain(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    custom_domain_id: "cd-1",
    domain: "auth.example.com",
    type: "auth0_managed_certs",
    primary: false,
    status: "pending",
    ...overrides,
  };
}

function proxyRoute(overrides: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    id: "pr-1",
    tenant_id: "tenant-1",
    custom_domain_id: "cd-1",
    priority: 100,
    match: { path: "/*" },
    handlers: [{ type: "passthrough", options: {} }],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCustomDomainsAdapter(): CustomDomainsAdapter & {
  rows: Map<string, CustomDomain>;
} {
  const rows = new Map<string, CustomDomain>();
  return {
    rows,
    create: vi.fn(async (tenant_id, input) => {
      const key = `${tenant_id}:${input.custom_domain_id || "new"}`;
      if (rows.has(key)) throw new Error("UNIQUE constraint failed");
      const cd = customDomain({
        ...input,
        custom_domain_id: input.custom_domain_id || "generated",
      });
      rows.set(`${tenant_id}:${cd.custom_domain_id}`, cd);
      return cd;
    }),
    get: vi.fn(async (tenant_id, id) => rows.get(`${tenant_id}:${id}`) || null),
    getByDomain: vi.fn(),
    list: vi.fn(),
    update: vi.fn(async (tenant_id, id, patch) => {
      const key = `${tenant_id}:${id}`;
      const existing = rows.get(key);
      if (!existing) return false;
      rows.set(key, { ...existing, ...patch });
      return true;
    }),
    remove: vi.fn(async (tenant_id, id) => {
      const key = `${tenant_id}:${id}`;
      if (!rows.has(key)) return false;
      rows.delete(key);
      return true;
    }),
  };
}

function makeProxyRoutesAdapter(): ProxyRoutesAdapter & {
  rows: Map<string, ProxyRoute>;
} {
  const rows = new Map<string, ProxyRoute>();
  return {
    rows,
    create: vi.fn(async (tenant_id, input) => {
      const id = input.id || "generated";
      const key = `${tenant_id}:${id}`;
      if (rows.has(key)) throw new Error("UNIQUE constraint failed");
      const pr = proxyRoute({
        id,
        tenant_id,
        custom_domain_id: input.custom_domain_id,
        priority: input.priority,
        match: input.match,
        handlers: input.handlers,
      });
      rows.set(key, pr);
      return pr;
    }),
    get: vi.fn(async (tenant_id, id) => rows.get(`${tenant_id}:${id}`) || null),
    list: vi.fn(),
    update: vi.fn(async (tenant_id, id, patch) => {
      const key = `${tenant_id}:${id}`;
      const existing = rows.get(key);
      if (!existing) return false;
      rows.set(key, { ...existing, ...patch });
      return true;
    }),
    remove: vi.fn(async (tenant_id, id) => {
      const key = `${tenant_id}:${id}`;
      if (!rows.has(key)) return false;
      rows.delete(key);
      return true;
    }),
  };
}

function syncEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  return {
    event_id: "evt-1",
    tenant_id: "tenant-1",
    entity: "custom_domain",
    op: "created",
    aggregate_id: "cd-1",
    payload: customDomain(),
    occurred_at: "2026-01-02T03:04:05.000Z",
    ...overrides,
  } as SyncEvent;
}

describe("createApplySyncEvents", () => {
  it("creates a custom_domain on a 'created' event", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const apply = createApplySyncEvents({ customDomains: cdAdapter });
    await apply([syncEvent()]);
    expect(cdAdapter.rows.get("tenant-1:cd-1")).toMatchObject({
      custom_domain_id: "cd-1",
      domain: "auth.example.com",
    });
  });

  it("is idempotent on duplicate 'created' (retry after success)", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const apply = createApplySyncEvents({ customDomains: cdAdapter });
    await apply([syncEvent()]);
    // Second delivery for the same event — receiver must not error.
    await apply([syncEvent()]);
    expect(cdAdapter.rows.size).toBe(1);
    // The fallback path went through update, not a second create.
    expect(cdAdapter.update).toHaveBeenCalled();
  });

  it("falls through to create on 'updated' when the row is missing", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const apply = createApplySyncEvents({ customDomains: cdAdapter });
    await apply([syncEvent({ op: "updated" })]);
    expect(cdAdapter.rows.get("tenant-1:cd-1")).toMatchObject({
      custom_domain_id: "cd-1",
    });
  });

  it("no-ops on 'deleted' when the row is already gone", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const apply = createApplySyncEvents({ customDomains: cdAdapter });
    await apply([syncEvent({ op: "deleted" })]);
    expect(cdAdapter.rows.size).toBe(0);
  });

  it("applies 'created' then 'deleted' in order leaves the row gone", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const apply = createApplySyncEvents({ customDomains: cdAdapter });
    await apply([syncEvent()]);
    await apply([syncEvent({ event_id: "evt-2", op: "deleted" })]);
    expect(cdAdapter.rows.size).toBe(0);
  });

  it("preserves the source id when creating a proxy_route", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const prAdapter = makeProxyRoutesAdapter();
    const apply = createApplySyncEvents({
      customDomains: cdAdapter,
      proxyRoutes: prAdapter,
    });
    await apply([
      syncEvent({
        entity: "proxy_route",
        aggregate_id: "pr-1",
        payload: proxyRoute(),
      }),
    ]);
    expect(prAdapter.rows.get("tenant-1:pr-1")).toMatchObject({
      id: "pr-1",
      custom_domain_id: "cd-1",
    });
  });

  it("throws when proxy_route event arrives but no proxyRoutes adapter is configured", async () => {
    const cdAdapter = makeCustomDomainsAdapter();
    const apply = createApplySyncEvents({ customDomains: cdAdapter });
    await expect(
      apply([
        syncEvent({
          entity: "proxy_route",
          aggregate_id: "pr-1",
          payload: proxyRoute(),
        }),
      ]),
    ).rejects.toThrow(/no proxyRoutes adapter/);
  });
});

describe("POST /sync route", () => {
  async function setup(
    applySyncEvents?: (events: SyncEvent[]) => Promise<void>,
  ) {
    const keyset = await createTestKeyset();
    const app = createProxyControlPlaneApp({
      resolveHost: async () => null,
      jwksFetch: keyset.jwksFetch,
      applySyncEvents,
    });
    return { app, keyset };
  }

  it("returns 404 when applySyncEvents is not configured (route not mounted)", async () => {
    const { app, keyset } = await setup();
    const auth = await bearer(keyset);
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: JSON.stringify({ events: [syncEvent()] }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when the bearer token is missing", async () => {
    const { app } = await setup(async () => {});
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [syncEvent()] }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when the bearer token has the wrong issuer", async () => {
    const { app, keyset } = await setup(async () => {});
    const auth = await bearer(keyset, { iss: "https://evil.example.test/" });
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: JSON.stringify({ events: [syncEvent()] }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    const { app, keyset } = await setup(async () => {});
    const auth = await bearer(keyset);
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: "not json",
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the body fails schema validation", async () => {
    const { app, keyset } = await setup(async () => {});
    const auth = await bearer(keyset);
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: JSON.stringify({ events: [{ event_id: "x" }] }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(400);
  });

  it("invokes applySyncEvents and returns 204 on success", async () => {
    const apply = vi.fn<(events: SyncEvent[]) => Promise<void>>(
      async () => {},
    );
    const { app, keyset } = await setup(apply);
    const auth = await bearer(keyset);
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: JSON.stringify({ events: [syncEvent()] }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(204);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[0]?.[0]).toMatchObject({
      event_id: "evt-1",
      entity: "custom_domain",
      op: "created",
    });
  });
});

describe("GET /hosts/:host route", () => {
  it("returns 401 without a bearer token", async () => {
    const keyset = await createTestKeyset();
    const app = createProxyControlPlaneApp({
      resolveHost: async () => null,
      jwksFetch: keyset.jwksFetch,
    });
    const res = await app.request(
      "/hosts/auth.example.com",
      {},
      envWithIssuer(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when resolveHost returns null", async () => {
    const keyset = await createTestKeyset();
    const app = createProxyControlPlaneApp({
      resolveHost: async () => null,
      jwksFetch: keyset.jwksFetch,
    });
    const auth = await bearer(keyset);
    const res = await app.request(
      "/hosts/auth.example.com",
      { headers: { authorization: auth } },
      envWithIssuer(),
    );
    expect(res.status).toBe(404);
  });

  it("returns the resolved host as JSON with a valid token", async () => {
    const keyset = await createTestKeyset();
    const resolved = {
      tenant_id: "tenant-1",
      custom_domain_id: "cd-1",
      domain: "auth.example.com",
      routes: [],
    };
    const app = createProxyControlPlaneApp({
      resolveHost: async () => resolved,
      jwksFetch: keyset.jwksFetch,
    });
    const auth = await bearer(keyset);
    const res = await app.request(
      "/hosts/auth.example.com",
      { headers: { authorization: auth } },
      envWithIssuer(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(resolved);
  });

  it("accepts a token whose iss matches a tenant-subdomain x-forwarded-host", async () => {
    // Caller proxies through to the control plane on a tenant subdomain.
    // The token was minted by that subdomain (iss = subdomain), so the
    // verifier must accept it even though it doesn't match env.ISSUER.
    const tenantHost = "sesamy.token.sesamy.com";
    const tenantIssuer = `https://${tenantHost}/`;
    const tenantKeyset = await createTestKeyset({
      jwksUrl: `https://${tenantHost}/.well-known/jwks.json`,
    });
    const app = createProxyControlPlaneApp({
      resolveHost: async () => ({
        tenant_id: "sesamy",
        custom_domain_id: "cd-1",
        domain: "login.parcferme.no",
        routes: [],
      }),
      jwksFetch: tenantKeyset.jwksFetch,
    });
    const auth = await bearer(tenantKeyset, { iss: tenantIssuer });
    const res = await app.request(
      "/hosts/login.parcferme.no",
      {
        headers: { authorization: auth, "x-forwarded-host": tenantHost },
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(200);
  });

  it("accepts a token whose iss matches a custom-domain x-forwarded-host", async () => {
    // End-user-visible custom domain (e.g. a publisher's login host) fronts
    // the proxy → control plane call. The token's iss is the custom domain,
    // its JWKS lives there, and the verifier should accept it.
    const customHost = "login.parcferme.no";
    const customIssuer = `https://${customHost}/`;
    const customKeyset = await createTestKeyset({
      jwksUrl: `https://${customHost}/.well-known/jwks.json`,
    });
    const app = createProxyControlPlaneApp({
      resolveHost: async () => ({
        tenant_id: "tenant-1",
        custom_domain_id: "cd-1",
        domain: customHost,
        routes: [],
      }),
      jwksFetch: customKeyset.jwksFetch,
    });
    const auth = await bearer(customKeyset, { iss: customIssuer });
    const res = await app.request(
      `/hosts/${customHost}`,
      {
        headers: { authorization: auth, "x-forwarded-host": customHost },
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a token whose iss matches neither env.ISSUER nor the inbound host", async () => {
    const keyset = await createTestKeyset();
    const app = createProxyControlPlaneApp({
      resolveHost: async () => null,
      jwksFetch: keyset.jwksFetch,
    });
    const auth = await bearer(keyset, { iss: "https://attacker.example/" });
    const res = await app.request(
      "/hosts/auth.example.com",
      {
        headers: {
          authorization: auth,
          "x-forwarded-host": "sesamy.token.sesamy.com",
        },
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(401);
  });
});
