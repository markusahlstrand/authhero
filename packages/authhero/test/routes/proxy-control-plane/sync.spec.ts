import { describe, it, expect, vi } from "vitest";
import type {
  ProxyRoute,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import { PROXY_RESOLVE_HOST_SCOPE } from "@authhero/proxy";
import {
  createApplySyncEvents,
  createProxyControlPlaneApp,
} from "../../../src/routes/proxy-control-plane";
import { CONTROL_PLANE_SYNC_SCOPE } from "../../../src/routes/proxy-control-plane/scopes";
import type { SyncEvent } from "../../../src/helpers/control-plane-sync-events";
import { createTestKeyset, type TestKeyset } from "./jwt-fixture";

const ISSUER = "https://issuer.example.test/";

async function bearer(
  keyset: TestKeyset,
  overrides: { scope?: string; iss?: string; tenantId?: string | null } = {},
): Promise<string> {
  const tenantId =
    overrides.tenantId === undefined ? "tenant-1" : overrides.tenantId;
  const token = await keyset.sign({
    payload: {
      iss: overrides.iss ?? ISSUER,
      sub: "auth-service",
      scope: overrides.scope ?? CONTROL_PLANE_SYNC_SCOPE,
      ...(tenantId === null ? {} : { tenant_id: tenantId }),
    },
  });
  return `Bearer ${token}`;
}

function envWithIssuer(): { ISSUER: string } {
  return { ISSUER };
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
    entity: "proxy_route",
    op: "created",
    aggregate_id: "pr-1",
    payload: proxyRoute(),
    occurred_at: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

describe("createApplySyncEvents", () => {
  it("creates a proxy_route on a 'created' event, preserving the source id", async () => {
    const prAdapter = makeProxyRoutesAdapter();
    const apply = createApplySyncEvents({ proxyRoutes: prAdapter });
    await apply([syncEvent()]);
    expect(prAdapter.rows.get("tenant-1:pr-1")).toMatchObject({
      id: "pr-1",
      custom_domain_id: "cd-1",
    });
  });

  it("is idempotent on duplicate 'created' (retry after success)", async () => {
    const prAdapter = makeProxyRoutesAdapter();
    const apply = createApplySyncEvents({ proxyRoutes: prAdapter });
    await apply([syncEvent()]);
    // Second delivery for the same event — receiver must not error.
    await apply([syncEvent()]);
    expect(prAdapter.rows.size).toBe(1);
    // The fallback path went through update, not a second create.
    expect(prAdapter.update).toHaveBeenCalled();
  });

  it("falls through to create on 'updated' when the row is missing", async () => {
    const prAdapter = makeProxyRoutesAdapter();
    const apply = createApplySyncEvents({ proxyRoutes: prAdapter });
    await apply([syncEvent({ op: "updated" })]);
    expect(prAdapter.rows.get("tenant-1:pr-1")).toMatchObject({ id: "pr-1" });
  });

  it("no-ops on 'deleted' when the row is already gone", async () => {
    const prAdapter = makeProxyRoutesAdapter();
    const apply = createApplySyncEvents({ proxyRoutes: prAdapter });
    await apply([syncEvent({ op: "deleted" })]);
    expect(prAdapter.rows.size).toBe(0);
  });

  it("applies 'created' then 'deleted' in order leaves the row gone", async () => {
    const prAdapter = makeProxyRoutesAdapter();
    const apply = createApplySyncEvents({ proxyRoutes: prAdapter });
    await apply([syncEvent()]);
    await apply([syncEvent({ event_id: "evt-2", op: "deleted" })]);
    expect(prAdapter.rows.size).toBe(0);
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
    const apply = vi.fn<(events: SyncEvent[]) => Promise<void>>(async () => {});
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
      entity: "proxy_route",
      op: "created",
    });
  });

  it("rejects a proxy host-resolution token — it is a read credential", async () => {
    // proxy:resolve_host belongs to the proxy for GET /hosts/:host. Accepting
    // it here would let that read credential rewrite global proxy routes.
    const apply = vi.fn<(events: SyncEvent[]) => Promise<void>>(async () => {});
    const { app, keyset } = await setup(apply);
    const auth = await bearer(keyset, { scope: PROXY_RESOLVE_HOST_SCOPE });
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
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to replicate events belonging to another tenant", async () => {
    // Every shard holds controlplane:sync, so the event's own tenant_id cannot
    // be trusted — bind to the token.
    const apply = vi.fn<(events: SyncEvent[]) => Promise<void>>(async () => {});
    const { app, keyset } = await setup(apply);
    const auth = await bearer(keyset, { tenantId: "t-attacker" });
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: JSON.stringify({
          events: [syncEvent({ tenant_id: "t-victim" })],
        }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses a token with no tenant binding — fail closed", async () => {
    // A sync token without a tenant_id claim must not be able to replicate an
    // arbitrary tenant's events; the check is skipped only when there is a
    // tenant to compare against, so it has to fail closed instead.
    const apply = vi.fn<(events: SyncEvent[]) => Promise<void>>(async () => {});
    const { app, keyset } = await setup(apply);
    const auth = await bearer(keyset, { tenantId: null });
    const res = await app.request(
      "/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: auth },
        body: JSON.stringify({
          events: [syncEvent({ tenant_id: "t-victim" })],
        }),
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects a token carrying an unrelated scope", async () => {
    const { app, keyset } = await setup(async () => {});
    const auth = await bearer(keyset, { scope: "openid" });
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
    const auth = await bearer(keyset, { scope: PROXY_RESOLVE_HOST_SCOPE });
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
    const auth = await bearer(keyset, { scope: PROXY_RESOLVE_HOST_SCOPE });
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
    const auth = await bearer(tenantKeyset, {
      iss: tenantIssuer,
      scope: PROXY_RESOLVE_HOST_SCOPE,
    });
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
    const auth = await bearer(customKeyset, {
      iss: customIssuer,
      scope: PROXY_RESOLVE_HOST_SCOPE,
    });
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
    const auth = await bearer(keyset, {
      iss: "https://attacker.example/",
      scope: PROXY_RESOLVE_HOST_SCOPE,
    });
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
