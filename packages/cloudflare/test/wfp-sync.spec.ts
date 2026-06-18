import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
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
          return handler?.(captured) ?? new Response(null, { status: 200 });
        },
      };
    },
  };
}

async function makeAdapters(): Promise<DataAdapters> {
  const sqlite = new SQLite(":memory:");
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
});

describe("createWfpForwardMiddleware", () => {
  function fakeTenants(rows: Record<string, Partial<Tenant>>): TenantsDataAdapter {
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

  function appWith(
    middleware: ReturnType<typeof createWfpForwardMiddleware>,
  ) {
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
        tenants: fakeTenants({ acme: { deployment_type: "wfp" } }),
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
      { waitUntil() {}, passThroughOnException() {}, props: {} },
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
    expect(signingKeys.map((k) => k.kid)).toEqual(["cp-kid-1"]);
    expect(signingKeys[0].tenant_id ?? null).toBeNull();
  });
});
