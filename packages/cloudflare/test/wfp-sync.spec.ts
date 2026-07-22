import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono, type ExecutionContext } from "hono";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import type {
  DataAdapters,
  Tenant,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import { createWfpForwardMiddleware } from "../src";
import { createDispatchSyncDefaults, createWfpTenantApp } from "../src/wfp";

const CP = "control_plane";

// 32-byte base64 keys for the tenant-app encryption ring.
function b64Key(seed: number): string {
  const bytes = new Uint8Array(32).fill(seed);
  return Buffer.from(bytes).toString("base64");
}

interface CapturedDispatch {
  scriptName: string;
  url: string;
  init?: RequestInit;
}

// A minimal but well-formed apply result — what the tenant worker echoes back
// and `createDispatchSyncDefaults` now parses and returns.
const OK_RESULT = {
  tenantId: CP,
  connections: { received: 1, upserted: 1, errors: [] },
  signingKeys: { received: 0, upserted: 0, errors: [] },
  tenants: { received: 1, upserted: 1, errors: [] },
};

/** Fake dispatch namespace recording `.get(name).fetch(url, init)` calls. */
function fakeDispatcher(handler?: (c: CapturedDispatch) => Response) {
  const calls: CapturedDispatch[] = [];
  return {
    calls,
    get(scriptName: string) {
      return {
        async fetch(url: Request | string, init?: RequestInit) {
          const captured: CapturedDispatch = {
            scriptName,
            url: typeof url === "string" ? url : url.url,
            init,
          };
          calls.push(captured);
          return handler?.(captured) ?? Response.json(OK_RESULT);
        },
      };
    },
  };
}

async function makeAdapters(): Promise<DataAdapters> {
  const sqlite = new SQLite(":memory:");
  // Enforce foreign keys so a tenant-scoped write into a D1 with no matching
  // `tenants` row fails exactly as a real provisioned tenant D1 would — this is
  // what makes the seed-projection regression test meaningful.
  sqlite.pragma("foreign_keys = ON");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);
  return createAdapters(db) as DataAdapters;
}

describe("createDispatchSyncDefaults", () => {
  it("builds the payload and POSTs it to the tenant script with the bearer secret", async () => {
    const cp = await makeAdapters();
    await cp.tenants.create({
      id: CP,
      friendly_name: CP,
      audience: "https://example.com",
      default_audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "Sender",
    });
    await cp.connections.create(CP, {
      id: "google",
      name: "google",
      strategy: "google-oauth2",
      options: {},
    });

    const dispatcher = fakeDispatcher();
    const sync = createDispatchSyncDefaults({
      dispatcher,
      internalSecret: "s3cret",
      controlPlaneTenantId: CP,
      controlPlaneAdapters: cp,
      scriptNameTemplate: "tenant-{tenant_id}-auth",
    });

    await sync("acme");

    expect(dispatcher.calls).toHaveLength(1);
    const call = dispatcher.calls[0];
    expect(call.scriptName).toBe("tenant-acme-auth");
    expect(call.url).toContain("/internal/sync-defaults");
    expect(call.init?.method).toBe("POST");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer s3cret");
    const body = JSON.parse(String(call.init?.body));
    expect(body.connections.map((c: { id: string }) => c.id)).toEqual([
      "google",
    ]);
  });

  it("throws when the tenant worker rejects the push", async () => {
    const cp = await makeAdapters();
    const dispatcher = fakeDispatcher(
      () => new Response("boom", { status: 500 }),
    );
    const sync = createDispatchSyncDefaults({
      dispatcher,
      internalSecret: "s3cret",
      controlPlaneTenantId: CP,
      controlPlaneAdapters: cp,
    });
    await expect(sync("acme")).rejects.toThrow(/failed: 500/);
  });

  it("surfaces the worker's structured error code from X-Authhero-Error", async () => {
    const cp = await makeAdapters();
    const dispatcher = fakeDispatcher(
      () =>
        new Response('{"error":"sync_defaults_apply_failed"}', {
          status: 500,
          headers: { "x-authhero-error": "sync_defaults_apply_failed" },
        }),
    );
    const sync = createDispatchSyncDefaults({
      dispatcher,
      internalSecret: "s3cret",
      controlPlaneTenantId: CP,
      controlPlaneAdapters: cp,
    });
    await expect(sync("acme")).rejects.toThrow(/sync_defaults_apply_failed/);
  });

  it("projects the tenant's own tenants row + signing keys so a tenant-scoped write succeeds", async () => {
    // Full provisioning round-trip: build the payload on the control plane and
    // route the dispatch POST into a real tenant app, which applies it to the
    // (freshly migrated, empty) tenant D1. Regression for the "ready but empty
    // D1" bug where the tenant's own `tenants` FK-target row was never seeded,
    // so every tenant-scoped insert FK-failed.
    const cp = await makeAdapters();
    await cp.tenants.create({ id: CP, friendly_name: "Control Plane" });
    // A control-plane signing key (no tenant_id) — projected so the tenant can
    // verify control-plane-minted tokens.
    await cp.keys.create({
      kid: "cp-kid-1",
      type: "jwt_signing",
      cert: "-----PUBLIC-----",
      fingerprint: "fp",
      thumbprint: "tp",
    });

    const tenantAdapters = await makeAdapters();
    const env = {
      AUTH_DB: {},
      ENCRYPTION_KEY: b64Key(1),
      ISSUER: "https://acme.tokens.example.com/",
      CONTROL_PLANE_TENANT_ID: CP,
      CONTROL_PLANE_ISSUER: "https://controlplane.example.com/",
      WFP_INTERNAL_SYNC_SECRET: "push-secret",
    };
    const tenantApp = createWfpTenantApp({
      createDataAdapter: () => tenantAdapters,
    });

    // Dispatch namespace that routes the control plane's POST into the tenant
    // app, the way a real WFP dispatch binding would.
    const dispatcher = {
      get() {
        return {
          async fetch(url: Request | string, init?: RequestInit) {
            const req = typeof url === "string" ? new Request(url, init) : url;
            return tenantApp.fetch(req, env, {
              waitUntil() {},
              passThroughOnException() {},
            } as unknown as ExecutionContext);
          },
        };
      },
    };

    const sync = createDispatchSyncDefaults({
      dispatcher: dispatcher as unknown as Parameters<
        typeof createDispatchSyncDefaults
      >[0]["dispatcher"],
      internalSecret: "push-secret",
      controlPlaneTenantId: CP,
      controlPlaneAdapters: cp,
      scriptNameTemplate: "tenant-{tenant_id}-auth",
    });

    const result = await sync("acme");

    // The tenant's own FK-target row was projected (alongside the control-plane
    // row), with no per-entity errors.
    expect(result.tenants.errors).toEqual([]);
    expect(result.tenants.upserted).toBe(2);
    const { tenants } = await tenantAdapters.tenants.list();
    expect(tenants.map((t) => t.id).sort()).toEqual([CP, "acme"].sort());

    // The control-plane verify key landed as a shared (no tenant_id) key.
    expect(result.signingKeys.upserted).toBe(1);
    const { signingKeys } = await tenantAdapters.keys.list({
      q: "type:jwt_signing AND -_exists_:tenant_id",
    });
    expect(signingKeys.map((k) => k.kid)).toContain("cp-kid-1");
    // Provisioning also minted the tenant's own PRIVATE signing key (#1181), so
    // /oauth/token can actually sign; the projected cp key is public-only.
    const signable = signingKeys.filter((k) => k.pkcs7);
    expect(signable).toHaveLength(1);
    expect(signable[0].kid).not.toBe("cp-kid-1");

    // The whole point: a tenant-scoped write into the fresh D1 now resolves its
    // `tenant_id -> tenants(id)` FK instead of 500ing.
    await expect(
      tenantAdapters.users.create("acme", {
        user_id: "auth2|seed-check",
        email: "seed@acme.example.com",
        email_verified: true,
        name: "Seed Check",
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      }),
    ).resolves.toBeTruthy();
  });

  it("resolves with the apply result the tenant worker returns", async () => {
    const cp = await makeAdapters();
    const dispatcher = fakeDispatcher();
    const sync = createDispatchSyncDefaults({
      dispatcher,
      internalSecret: "s3cret",
      controlPlaneTenantId: CP,
      controlPlaneAdapters: cp,
    });
    const result = await sync("acme");
    expect(result).toEqual(OK_RESULT);
  });
});

describe("createWfpForwardMiddleware", () => {
  function fakeTenants(
    rows: Record<string, Partial<Tenant>>,
  ): TenantsDataAdapter {
    return {
      async create() {
        throw new Error("not used");
      },
      async get(id: string) {
        const row = rows[id];
        return row ? ({ id, friendly_name: id, ...row } as Tenant) : null;
      },
      async list() {
        return { tenants: [] };
      },
      async update() {},
      async remove() {
        return true;
      },
    };
  }

  function appWith(middleware: ReturnType<typeof createWfpForwardMiddleware>) {
    const app = new Hono();
    app.use("*", middleware);
    app.all("*", (c) => c.text("served-locally"));
    return app;
  }

  it("forwards a wfp tenant's request to its worker", async () => {
    const dispatcher = fakeDispatcher(
      () => new Response("from-tenant-worker", { status: 200 }),
    );
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          acme: { deployment_type: "wfp", provisioning_state: "ready" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    const res = await app.request(
      "/authorize",
      { headers: { "tenant-id": "acme" } },
      { DISPATCHER: dispatcher },
    );

    expect(await res.text()).toBe("from-tenant-worker");
    expect(dispatcher.calls[0].scriptName).toBe("tenant-acme-auth");
  });

  it("re-wraps the dispatched response so its headers are mutable", async () => {
    // A response straight from `fetch()` / WFP dispatch carries an immutable
    // header guard. authhero core mounts this middleware inside its CORS
    // middleware, which appends `Vary`/`Access-Control-*` after the fact — so
    // the forwarded response must come back with mutable headers or every
    // dispatched request 500s.
    function immutableResponse(body: string, status: number): Response {
      const res = new Response(body, { status });
      const throwImmutable = () => {
        throw new TypeError("Can't modify immutable headers.");
      };
      for (const method of ["append", "set", "delete"] as const) {
        Object.defineProperty(res.headers, method, {
          value: throwImmutable,
          configurable: true,
        });
      }
      return res;
    }

    const dispatcher = fakeDispatcher(() =>
      immutableResponse("from-tenant-worker", 200),
    );
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          acme: { deployment_type: "wfp", provisioning_state: "ready" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    const res = await app.request(
      "/authorize",
      { headers: { "tenant-id": "acme" } },
      { DISPATCHER: dispatcher },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("from-tenant-worker");
    // The re-wrapped response has the mutable "response" guard — appending a
    // header (as the CORS middleware does) must not throw.
    expect(() => res.headers.append("Vary", "Origin")).not.toThrow();
  });

  it("serves locally for a wfp tenant that is not yet ready", async () => {
    const dispatcher = fakeDispatcher();
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          pending: { deployment_type: "wfp", provisioning_state: "pending" },
          failed: { deployment_type: "wfp", provisioning_state: "failed" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    for (const tenantId of ["pending", "failed"]) {
      const res = await app.request(
        "/authorize",
        { headers: { "tenant-id": tenantId } },
        { DISPATCHER: dispatcher },
      );
      expect(await res.text()).toBe("served-locally");
    }
    expect(dispatcher.calls).toHaveLength(0);
  });

  it("serves locally for the control plane, shared, and unknown tenants", async () => {
    const dispatcher = fakeDispatcher();
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          shared: { deployment_type: "shared" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    for (const tenantId of [CP, "shared", "missing"]) {
      const res = await app.request(
        "/authorize",
        { headers: { "tenant-id": tenantId } },
        { DISPATCHER: dispatcher },
      );
      expect(await res.text()).toBe("served-locally");
    }
    expect(dispatcher.calls).toHaveLength(0);
  });

  it("returns a structured 503 when the tenant worker is not in the namespace", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatcher = fakeDispatcher(() => {
      throw new Error("Worker not found.");
    });
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          acme: { deployment_type: "wfp", provisioning_state: "ready" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    const res = await app.request(
      "/users",
      { headers: { "tenant-id": "acme" } },
      { DISPATCHER: dispatcher },
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("X-Authhero-Error")).toBe("wfp_worker_not_found");
    expect(res.headers.get("X-Wfp-Tenant")).toBe("acme");
    expect(await res.json()).toMatchObject({
      error: "wfp_worker_not_found",
      tenant_id: "acme",
    });
  });

  it("returns a structured 502 on an unexpected dispatch failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatcher = fakeDispatcher(() => {
      throw new Error("connection reset");
    });
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          acme: { deployment_type: "wfp", provisioning_state: "ready" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    const res = await app.request(
      "/users",
      { headers: { "tenant-id": "acme" } },
      { DISPATCHER: dispatcher },
    );

    expect(res.status).toBe(502);
    expect(res.headers.get("X-Authhero-Error")).toBe("wfp_dispatch_failed");
    expect(res.headers.get("X-Wfp-Tenant")).toBe("acme");
    expect(await res.json()).toMatchObject({
      error: "wfp_dispatch_failed",
      tenant_id: "acme",
    });
  });

  it("passes a tenant worker 5xx through and tags it for correlation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatcher = fakeDispatcher(
      () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "X-Authhero-Error": "tenant_app_error" },
        }),
    );
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          acme: { deployment_type: "wfp", provisioning_state: "ready" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    const res = await app.request(
      "/users",
      { headers: { "tenant-id": "acme" } },
      { DISPATCHER: dispatcher },
    );

    // The tenant worker's own response (status + body + its error code) is
    // preserved; the dispatcher only adds the tenant tag.
    expect(res.status).toBe(500);
    expect(res.headers.get("X-Authhero-Error")).toBe("tenant_app_error");
    expect(res.headers.get("X-Wfp-Tenant")).toBe("acme");
    expect(await res.json()).toMatchObject({ error: "boom" });
  });

  it("tags a successful dispatched response with X-Wfp-Tenant", async () => {
    const dispatcher = fakeDispatcher(
      () => new Response("from-tenant-worker", { status: 200 }),
    );
    const app = appWith(
      createWfpForwardMiddleware({
        tenants: fakeTenants({
          acme: { deployment_type: "wfp", provisioning_state: "ready" },
        }),
        controlPlaneTenantId: CP,
      }),
    );

    const res = await app.request(
      "/users",
      { headers: { "tenant-id": "acme" } },
      { DISPATCHER: dispatcher },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Wfp-Tenant")).toBe("acme");
  });
});

describe("createWfpTenantApp /internal/sync-defaults", () => {
  let tenant: DataAdapters;
  let app: ReturnType<typeof createWfpTenantApp>;

  const env = {
    AUTH_DB: {},
    ENCRYPTION_KEY: b64Key(1),
    ISSUER: "https://acme.tokens.example.com/",
    CONTROL_PLANE_TENANT_ID: CP,
    CONTROL_PLANE_ISSUER: "https://controlplane.example.com/",
    WFP_INTERNAL_SYNC_SECRET: "push-secret",
  };

  const payload = {
    connections: [],
    resourceServers: [],
    hooks: [],
    emailProvider: null,
    branding: null,
    promptSettings: null,
    signingKeys: [
      {
        kid: "cp-kid-1",
        type: "jwt_signing" as const,
        cert: "-----PUBLIC-----",
        fingerprint: "fp",
        thumbprint: "tp",
      },
    ],
  };

  beforeEach(async () => {
    tenant = await makeAdapters();
    app = createWfpTenantApp({ createDataAdapter: () => tenant });
  });

  function post(secret?: string) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (secret) headers.authorization = `Bearer ${secret}`;
    return app.fetch(
      new Request("https://tenant.internal/internal/sync-defaults", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
      env,
      { waitUntil() {}, passThroughOnException() {} },
    );
  }

  it("rejects a push without the shared secret", async () => {
    const res = await post();
    expect(res.status).toBe(401);
  });

  it("rejects a push with the wrong secret", async () => {
    const res = await post("nope");
    expect(res.status).toBe(401);
  });

  it("applies the payload and projects the control-plane verify key", async () => {
    const res = await post("push-secret");
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.signingKeys.upserted).toBe(1);

    const { signingKeys } = await tenant.keys.list({
      q: "type:jwt_signing AND -_exists_:tenant_id",
    });
    const cpKey = signingKeys.find((k) => k.kid === "cp-kid-1");
    expect(cpKey).toBeTruthy();
    expect(cpKey!.tenant_id ?? null).toBeNull();
  });

  it("mints the tenant's own private signing key so /oauth/token can sign (#1181)", async () => {
    const res = await post("push-secret");
    expect(res.status).toBe(200);
    const result = await res.json();
    // The response surfaces that a key was minted during provisioning.
    expect(result.signingKey).toEqual({ created: true });

    // A signable (private-material) key now exists in the control-plane scope,
    // distinct from the projected public-only cp key.
    const { signingKeys } = await tenant.keys.list({
      q: "type:jwt_signing AND -_exists_:tenant_id",
    });
    const signable = signingKeys.filter((k) => k.pkcs7);
    expect(signable).toHaveLength(1);
    expect(signable[0].kid).not.toBe("cp-kid-1");
  });

  it("is idempotent: a re-sync does not mint a second signing key (#1181)", async () => {
    const first = await (await post("push-secret")).json();
    expect(first.signingKey).toEqual({ created: true });

    const second = await (await post("push-secret")).json();
    expect(second.signingKey).toEqual({ created: false });

    const { signingKeys } = await tenant.keys.list({
      q: "type:jwt_signing AND -_exists_:tenant_id",
    });
    expect(signingKeys.filter((k) => k.pkcs7)).toHaveLength(1);
  });

  it("invokes onSyncResult with the applied result", async () => {
    const onSyncResult = vi.fn();
    app = createWfpTenantApp({
      createDataAdapter: () => tenant,
      onSyncResult,
    });
    const res = await post("push-secret");
    expect(res.status).toBe(200);
    expect(onSyncResult).toHaveBeenCalledOnce();
    const [result, passedEnv] = onSyncResult.mock.calls[0];
    expect(result.signingKeys.upserted).toBe(1);
    expect(passedEnv).toBe(env);
  });

  it("returns a structured 500 (logged + X-Authhero-Error) when apply throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // A non-object `branding` fails `brandingSchema.parse` before any row is
      // written — the apply throws regardless of continueOnError.
      const res = await app.fetch(
        new Request("https://tenant.internal/internal/sync-defaults", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer push-secret",
          },
          body: JSON.stringify({ ...payload, branding: "not-an-object" }),
        }),
        env,
        { waitUntil() {}, passThroughOnException() {} },
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("x-authhero-error")).toBe(
        "sync_defaults_apply_failed",
      );
      const body = await res.json();
      expect(body.error).toBe("sync_defaults_apply_failed");
      expect(typeof body.detail).toBe("string");
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns a structured 500 carrying the result when onSyncResult throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    app = createWfpTenantApp({
      createDataAdapter: () => tenant,
      onSyncResult: () => {
        throw new Error("logging sink down");
      },
    });
    try {
      const res = await post("push-secret");
      expect(res.status).toBe(500);
      expect(res.headers.get("x-authhero-error")).toBe(
        "sync_defaults_on_result_failed",
      );
      const body = await res.json();
      // The apply committed — the result is still surfaced.
      expect(body.result.signingKeys.upserted).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
