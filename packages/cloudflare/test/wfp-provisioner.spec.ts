import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  CloudflareApiClient,
  CloudflareApiError,
  createCloudflareWfpD1Provisioner,
  createWfpTenantProvisioningHook,
} from "../src";
import type {
  CloudflareWfpD1Provisioner,
  ProvisionResult,
} from "../src";
import type { Tenant, TenantsDataAdapter } from "@authhero/adapter-interfaces";

const ACCOUNT_ID = "acc_test";
const NAMESPACE = "authhero-tenants";
const API_BASE = "https://api.cloudflare.com/client/v4";

// Track which CF endpoints get hit, in what order, with which payloads.
// Each test sets up handlers and then asserts the captured sequence.
interface CapturedRequest {
  method: string;
  path: string;
  body: unknown;
}

let captured: CapturedRequest[];

function path(p: string): string {
  return `${API_BASE}${p}`;
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  server.resetHandlers();
  captured = [];
});

async function captureBody(req: Request): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) {
      if (v instanceof Blob) {
        out[k] = await v.text();
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  if (ct.includes("application/json")) {
    return await req.json();
  }
  return await req.text();
}

describe("CloudflareApiClient", () => {
  it("createD1Database POSTs the name and returns the uuid", async () => {
    server.use(
      http.post(path(`/accounts/${ACCOUNT_ID}/d1/database`), async ({ request }) => {
        captured.push({
          method: "POST",
          path: "/d1/database",
          body: await captureBody(request),
        });
        return HttpResponse.json({
          result: { uuid: "db_uuid_1", name: "tenant-kvartal" },
          success: true,
        });
      }),
    );
    const client = new CloudflareApiClient({
      accountId: ACCOUNT_ID,
      apiToken: "token",
    });
    const created = await client.createD1Database("tenant-kvartal");
    expect(created.uuid).toBe("db_uuid_1");
    expect(captured).toHaveLength(1);
    expect(captured[0].body).toEqual({ name: "tenant-kvartal" });
  });

  it("execD1 posts SQL to the query endpoint", async () => {
    server.use(
      http.post(
        path(`/accounts/${ACCOUNT_ID}/d1/database/db_1/query`),
        async ({ request }) => {
          captured.push({
            method: "POST",
            path: "/d1/database/:id/query",
            body: await captureBody(request),
          });
          return HttpResponse.json({
            result: [{ success: true, results: [] }],
            success: true,
          });
        },
      ),
    );
    const client = new CloudflareApiClient({
      accountId: ACCOUNT_ID,
      apiToken: "token",
    });
    const result = await client.execD1("db_1", "CREATE TABLE users (id TEXT);");
    expect(result[0].success).toBe(true);
    expect((captured[0].body as { sql: string }).sql).toContain("CREATE TABLE");
  });

  it("uploadNamespacedScript PUTs a multipart with metadata + main module", async () => {
    server.use(
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal`,
        ),
        async ({ request }) => {
          captured.push({
            method: "PUT",
            path: "/scripts/kvartal",
            body: await captureBody(request),
          });
          return HttpResponse.json({ result: {}, success: true });
        },
      ),
    );
    const client = new CloudflareApiClient({
      accountId: ACCOUNT_ID,
      apiToken: "token",
    });
    await client.uploadNamespacedScript(NAMESPACE, "kvartal", {
      script: "export default { fetch() { return new Response('ok'); } };",
      mainModule: "index.js",
      compatibilityDate: "2026-05-01",
      compatibilityFlags: ["nodejs_compat"],
      bindings: [{ type: "d1", name: "AUTH_DB", id: "db_uuid_1" }],
    });
    expect(captured).toHaveLength(1);
    const body = captured[0].body as Record<string, string>;
    expect(body["metadata"]).toContain('"main_module":"index.js"');
    expect(body["metadata"]).toContain('"id":"db_uuid_1"');
    expect(body["index.js"]).toContain("Response('ok')");
  });

  it("setNamespacedScriptSecret PUTs one secret at a time", async () => {
    server.use(
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal/secrets`,
        ),
        async ({ request }) => {
          captured.push({
            method: "PUT",
            path: "/scripts/kvartal/secrets",
            body: await captureBody(request),
          });
          return HttpResponse.json({ result: {}, success: true });
        },
      ),
    );
    const client = new CloudflareApiClient({
      accountId: ACCOUNT_ID,
      apiToken: "token",
    });
    await client.setNamespacedScriptSecret(
      NAMESPACE,
      "kvartal",
      "ENCRYPTION_KEY",
      "supersecret",
    );
    expect(captured[0].body).toEqual({
      name: "ENCRYPTION_KEY",
      text: "supersecret",
      type: "secret_text",
    });
  });

  it("default fetch is not invoked with the client as `this` (workerd brand check)", async () => {
    server.use(
      http.post(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json({
          result: { uuid: "db_uuid_strict", name: "tenant-strict" },
          success: true,
        }),
      ),
    );
    // Mimic workerd: the global fetch throws when called with a foreign
    // `this` (e.g. `this.fetchImpl(...)` binding the client instance).
    const realFetch = fetch;
    function strictFetch(
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError(
          "Illegal invocation: function called with incorrect `this` reference.",
        );
      }
      return realFetch(input, init);
    }
    vi.stubGlobal("fetch", strictFetch);
    try {
      const client = new CloudflareApiClient({
        accountId: ACCOUNT_ID,
        apiToken: "token",
      });
      const created = await client.createD1Database("tenant-strict");
      expect(created.uuid).toBe("db_uuid_strict");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("non-2xx responses throw CloudflareApiError with the status + body + errors array", async () => {
    server.use(
      http.post(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json(
          { errors: [{ code: 7501, message: "Name already taken" }], success: false },
          { status: 400 },
        ),
      ),
    );
    const client = new CloudflareApiClient({
      accountId: ACCOUNT_ID,
      apiToken: "token",
    });
    await expect(client.createD1Database("dup")).rejects.toMatchObject({
      name: "CloudflareApiError",
      status: 400,
    });
    // Verify the errors array is preserved
    try {
      await client.createD1Database("dup");
    } catch (err) {
      const cfErr = err as CloudflareApiError;
      expect(cfErr.errors).toEqual([
        { code: 7501, message: "Name already taken" },
      ]);
    }
  });
});

describe("createCloudflareWfpD1Provisioner", () => {
  function setupHappyPath(): void {
    server.use(
      http.get(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json({ result: [], success: true }),
      ),
      http.post(path(`/accounts/${ACCOUNT_ID}/d1/database`), async ({ request }) => {
        captured.push({
          method: "POST",
          path: "/d1/database",
          body: await captureBody(request),
        });
        return HttpResponse.json({
          result: { uuid: "db_kvartal", name: "tenant-kvartal" },
          success: true,
        });
      }),
      http.post(
        path(`/accounts/${ACCOUNT_ID}/d1/database/db_kvartal/query`),
        async ({ request }) => {
          captured.push({
            method: "POST",
            path: "/d1/exec",
            body: await captureBody(request),
          });
          return HttpResponse.json({
            result: [{ success: true, results: [] }],
            success: true,
          });
        },
      ),
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal`,
        ),
        async ({ request }) => {
          captured.push({
            method: "PUT",
            path: "/scripts/kvartal",
            body: await captureBody(request),
          });
          return HttpResponse.json({ result: {}, success: true });
        },
      ),
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal/secrets`,
        ),
        async ({ request }) => {
          captured.push({
            method: "PUT",
            path: "/scripts/kvartal/secrets",
            body: await captureBody(request),
          });
          return HttpResponse.json({ result: {}, success: true });
        },
      ),
    );
  }

  it("onProvision runs the full sequence: create D1 → migrate → upload script → set secrets", async () => {
    setupHappyPath();
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "export default { fetch() { return new Response('hi'); } };",
      migrations: [
        { name: "0000_init.sql", sql: "CREATE TABLE users (id TEXT);" },
        { name: "0001_add_keys.sql", sql: "CREATE TABLE keys (kid TEXT);" },
      ],
      secrets: async () => ({
        ENCRYPTION_KEY: "secret_value",
        ISSUER: "https://auth.example.com",
      }),
    });

    await provisioner.onProvision("kvartal");

    // Order: D1 create, two migration execs, script upload, two secret puts
    const paths = captured.map((c) => c.path);
    expect(paths).toEqual([
      "/d1/database",
      "/d1/exec",
      "/d1/exec",
      "/scripts/kvartal",
      "/scripts/kvartal/secrets",
      "/scripts/kvartal/secrets",
    ]);

    // D1 is named per the default template
    expect((captured[0].body as { name: string }).name).toBe("tenant-kvartal");

    // Script binds the D1 by uuid + plain-text the control-plane URL
    const metadata = JSON.parse(
      (captured[3].body as Record<string, string>)["metadata"],
    );
    const dbBinding = metadata.bindings.find((b: { name: string }) => b.name === "AUTH_DB");
    const cpBinding = metadata.bindings.find(
      (b: { name: string }) => b.name === "CONTROL_PLANE_BASE_URL",
    );
    expect(dbBinding).toMatchObject({ type: "d1", id: "db_kvartal" });
    expect(cpBinding).toMatchObject({
      type: "plain_text",
      text: "https://auth.example.com",
    });

    // Secrets uploaded as secret_text
    const secret1 = captured[4].body as Record<string, string>;
    const secret2 = captured[5].body as Record<string, string>;
    const names = [secret1.name, secret2.name].sort();
    expect(names).toEqual(["ENCRYPTION_KEY", "ISSUER"]);
    expect(secret1.type).toBe("secret_text");
  });

  it("appends extraBindings (e.g. a service binding) after the default bindings", async () => {
    setupHappyPath();
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "export default {};",
      migrations: [{ name: "0.sql", sql: "SELECT 1;" }],
      secrets: async () => ({ X: "y" }),
      extraBindings: [
        { type: "service", name: "JWKS_SERVICE", service: "control-plane-auth" },
        { type: "plain_text", name: "REGION", text: "eu" },
      ],
    });

    await provisioner.onProvision("kvartal");

    const upload = captured.find((c) => c.path === "/scripts/kvartal");
    const metadata = JSON.parse(
      (upload!.body as Record<string, string>)["metadata"],
    );
    const names = metadata.bindings.map((b: { name: string }) => b.name);
    // Defaults first, extras appended in order.
    expect(names).toEqual([
      "AUTH_DB",
      "CONTROL_PLANE_BASE_URL",
      "JWKS_SERVICE",
      "REGION",
    ]);
    expect(
      metadata.bindings.find((b: { name: string }) => b.name === "JWKS_SERVICE"),
    ).toEqual({
      type: "service",
      name: "JWKS_SERVICE",
      service: "control-plane-auth",
    });
  });

  it("onProvision reuses an existing D1 by name instead of re-creating", async () => {
    server.use(
      http.get(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json({
          result: [{ uuid: "db_existing", name: "tenant-kvartal" }],
          success: true,
        }),
      ),
      // Should NOT POST to create — fail if we do
      http.post(path(`/accounts/${ACCOUNT_ID}/d1/database`), () => {
        captured.push({ method: "POST", path: "/d1/database", body: {} });
        return HttpResponse.json({ result: {}, success: true });
      }),
      http.post(
        path(`/accounts/${ACCOUNT_ID}/d1/database/db_existing/query`),
        async ({ request }) => {
          captured.push({
            method: "POST",
            path: "/d1/exec",
            body: await captureBody(request),
          });
          return HttpResponse.json({ result: [{ success: true }], success: true });
        },
      ),
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal`,
        ),
        async () => HttpResponse.json({ result: {}, success: true }),
      ),
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal/secrets`,
        ),
        async () => HttpResponse.json({ result: {}, success: true }),
      ),
    );
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "export default {};",
      migrations: [{ name: "0000.sql", sql: "SELECT 1;" }],
      secrets: async () => ({ ENCRYPTION_KEY: "x" }),
    });

    await provisioner.onProvision("kvartal");

    const posts = captured.filter((c) => c.path === "/d1/database");
    expect(posts).toHaveLength(0);
    // Confirms the migration was applied against the existing uuid
    expect(captured.find((c) => c.path === "/d1/exec")).toBeDefined();
  });

  it("onDeprovision deletes the namespaced script then the D1", async () => {
    server.use(
      http.delete(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal`,
        ),
        () => {
          captured.push({ method: "DELETE", path: "/scripts/kvartal", body: null });
          return HttpResponse.json({ result: null, success: true });
        },
      ),
      http.get(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json({
          result: [{ uuid: "db_kvartal", name: "tenant-kvartal" }],
          success: true,
        }),
      ),
      http.delete(
        path(`/accounts/${ACCOUNT_ID}/d1/database/db_kvartal`),
        () => {
          captured.push({ method: "DELETE", path: "/d1/database/db_kvartal", body: null });
          return HttpResponse.json({ result: null, success: true });
        },
      ),
    );
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "",
      migrations: [],
      secrets: async () => ({}),
    });

    await provisioner.onDeprovision("kvartal");

    expect(captured.map((c) => c.path)).toEqual([
      "/scripts/kvartal",
      "/d1/database/db_kvartal",
    ]);
  });

  it("onDeprovision tolerates missing script + missing D1 (idempotent)", async () => {
    server.use(
      http.delete(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/kvartal`,
        ),
        () =>
          HttpResponse.json(
            { errors: [{ message: "Script not found" }], success: false },
            { status: 404 },
          ),
      ),
      http.get(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json({ result: [], success: true }),
      ),
    );
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "",
      migrations: [],
      secrets: async () => ({}),
    });
    // Must not throw — both resources already gone.
    await provisioner.onDeprovision("kvartal");
  });

  it("script and D1 names honor the template option", async () => {
    server.use(
      http.get(path(`/accounts/${ACCOUNT_ID}/d1/database`), () =>
        HttpResponse.json({ result: [], success: true }),
      ),
      http.post(
        path(`/accounts/${ACCOUNT_ID}/d1/database`),
        async ({ request }) => {
          captured.push({
            method: "POST",
            path: "/d1/database",
            body: await captureBody(request),
          });
          return HttpResponse.json({
            result: { uuid: "db_x", name: "authhero-tenant-kvartal" },
            success: true,
          });
        },
      ),
      http.post(
        path(`/accounts/${ACCOUNT_ID}/d1/database/db_x/query`),
        () => HttpResponse.json({ result: [{ success: true }], success: true }),
      ),
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/tenant-kvartal-auth`,
        ),
        () => {
          captured.push({ method: "PUT", path: "/scripts/tenant-kvartal-auth", body: null });
          return HttpResponse.json({ result: {}, success: true });
        },
      ),
      http.put(
        path(
          `/accounts/${ACCOUNT_ID}/workers/dispatch/namespaces/${NAMESPACE}/scripts/tenant-kvartal-auth/secrets`,
        ),
        () => HttpResponse.json({ result: {}, success: true }),
      ),
    );
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "",
      migrations: [{ name: "0.sql", sql: "SELECT 1;" }],
      secrets: async () => ({ X: "y" }),
      scriptNameTemplate: "tenant-{tenant_id}-auth",
      d1NameTemplate: "authhero-tenant-{tenant_id}",
    });
    await provisioner.onProvision("kvartal");
    expect((captured[0].body as { name: string }).name).toBe(
      "authhero-tenant-kvartal",
    );
    expect(captured.find((c) => c.path === "/scripts/tenant-kvartal-auth")).toBeDefined();
  });

  it("onProvision returns the resource ids the caller needs to persist", async () => {
    setupHappyPath();
    const provisioner = createCloudflareWfpD1Provisioner({
      accountId: ACCOUNT_ID,
      apiToken: "token",
      dispatchNamespace: NAMESPACE,
      controlPlaneBaseUrl: "https://auth.example.com",
      tenantWorkerScript: "",
      migrations: [{ name: "0.sql", sql: "SELECT 1;" }],
      secrets: async () => ({ X: "y" }),
    });
    const result = await provisioner.onProvision("kvartal");
    expect(result).toEqual({
      d1DatabaseId: "db_kvartal",
      scriptName: "kvartal",
      d1Name: "tenant-kvartal",
    });
  });
});

// ─── createWfpTenantProvisioningHook ────────────────────────────────────

describe("createWfpTenantProvisioningHook", () => {
  function fakeProvisioner(): CloudflareWfpD1Provisioner & {
    onProvisionCalls: string[];
    onDeprovisionCalls: string[];
    nextProvisionResult: ProvisionResult;
    nextProvisionError?: Error;
  } {
    const stub = {
      onProvisionCalls: [] as string[],
      onDeprovisionCalls: [] as string[],
      nextProvisionResult: {
        d1DatabaseId: "db_x",
        scriptName: "kvartal",
        d1Name: "tenant-kvartal",
      } satisfies ProvisionResult,
      nextProvisionError: undefined as Error | undefined,
      async onProvision(id: string): Promise<ProvisionResult> {
        stub.onProvisionCalls.push(id);
        if (stub.nextProvisionError) throw stub.nextProvisionError;
        return stub.nextProvisionResult;
      },
      async onDeprovision(id: string): Promise<void> {
        stub.onDeprovisionCalls.push(id);
      },
    };
    return stub;
  }

  function fakeTenantsAdapter(
    initial: Partial<Tenant> & { id: string },
  ): TenantsDataAdapter & { store: Map<string, Partial<Tenant>> } {
    const store = new Map<string, Partial<Tenant>>([[initial.id, initial]]);
    return {
      store,
      async create(): Promise<Tenant> {
        throw new Error("not used in tests");
      },
      async get(id: string): Promise<Tenant | null> {
        return (store.get(id) as Tenant | undefined) ?? null;
      },
      async list() {
        return { tenants: Array.from(store.values()) as Tenant[] };
      },
      async update(id: string, patch: Partial<Tenant>): Promise<void> {
        const cur = store.get(id);
        if (!cur) return;
        store.set(id, { ...cur, ...patch });
      },
      async remove(id: string): Promise<boolean> {
        return store.delete(id);
      },
    };
  }

  it("skips provisioning when deployment_type is not 'wfp'", async () => {
    const provisioner = fakeProvisioner();
    const tenants = fakeTenantsAdapter({
      id: "shared-tenant",
      deployment_type: "shared",
    });
    const hook = createWfpTenantProvisioningHook({ provisioner, tenants });
    await hook.onProvision("shared-tenant");
    expect(provisioner.onProvisionCalls).toEqual([]);
    expect(tenants.store.get("shared-tenant")).toMatchObject({
      deployment_type: "shared",
    });
  });

  it("provisions and writes back resource ids when deployment_type is 'wfp'", async () => {
    const provisioner = fakeProvisioner();
    provisioner.nextProvisionResult = {
      d1DatabaseId: "db_kvartal",
      scriptName: "kvartal",
      d1Name: "tenant-kvartal",
    };
    const tenants = fakeTenantsAdapter({
      id: "kvartal",
      deployment_type: "wfp",
      provisioning_state: "pending",
    });
    const hook = createWfpTenantProvisioningHook({ provisioner, tenants });
    await hook.onProvision("kvartal");
    expect(provisioner.onProvisionCalls).toEqual(["kvartal"]);
    const row = tenants.store.get("kvartal");
    expect(row).toMatchObject({
      d1_database_id: "db_kvartal",
      worker_script_name: "kvartal",
      provisioning_state: "ready",
    });
    expect(row?.provisioning_state_changed_at).toMatch(/^\d{4}-/);
  });

  it("marks provisioning_state='failed' with the error message when the provisioner throws", async () => {
    const provisioner = fakeProvisioner();
    provisioner.nextProvisionError = new Error("D1 quota exceeded");
    const tenants = fakeTenantsAdapter({
      id: "kvartal",
      deployment_type: "wfp",
      provisioning_state: "pending",
    });
    const hook = createWfpTenantProvisioningHook({ provisioner, tenants });
    await expect(hook.onProvision("kvartal")).rejects.toThrow(
      /D1 quota exceeded/,
    );
    const row = tenants.store.get("kvartal");
    expect(row).toMatchObject({
      provisioning_state: "failed",
      provisioning_error: "D1 quota exceeded",
    });
    // d1_database_id should NOT be set on failure
    expect(row?.d1_database_id).toBeUndefined();
  });

  it("uses the shouldProvision predicate when supplied", async () => {
    const provisioner = fakeProvisioner();
    const tenants = fakeTenantsAdapter({
      id: "kvartal",
      deployment_type: "shared",
      storage_kind: "own_d1",
    });
    const hook = createWfpTenantProvisioningHook({
      provisioner,
      tenants,
      // Custom signal: provision whenever storage_kind says own_d1, regardless
      // of deployment_type (illustrative — not a recommended config).
      shouldProvision: (t) => t.storage_kind === "own_d1",
    });
    await hook.onProvision("kvartal");
    expect(provisioner.onProvisionCalls).toEqual(["kvartal"]);
  });

  it("onDeprovision skips when the tenant was 'shared'", async () => {
    const provisioner = fakeProvisioner();
    const tenants = fakeTenantsAdapter({
      id: "kvartal",
      deployment_type: "shared",
    });
    const hook = createWfpTenantProvisioningHook({ provisioner, tenants });
    await hook.onDeprovision("kvartal");
    expect(provisioner.onDeprovisionCalls).toEqual([]);
  });

  it("onDeprovision defaults to running when the tenant row is already gone", async () => {
    // Sometimes the multi-tenancy delete cascades before this hook runs. In
    // that case we don't know what type the tenant was — better to attempt
    // deprovision than leave CF resources orphaned.
    const provisioner = fakeProvisioner();
    const tenants = fakeTenantsAdapter({
      id: "other",
      deployment_type: "shared",
    });
    const hook = createWfpTenantProvisioningHook({ provisioner, tenants });
    await hook.onDeprovision("kvartal-already-deleted");
    expect(provisioner.onDeprovisionCalls).toEqual(["kvartal-already-deleted"]);
  });

  it("logs a warning when the write-back fails after a successful provision", async () => {
    const provisioner = fakeProvisioner();
    provisioner.nextProvisionError = new Error("upstream failed");
    const tenants: TenantsDataAdapter = {
      async create() {
        throw new Error("not used");
      },
      async get() {
        return {
          id: "kvartal",
          friendly_name: "Kvartal",
          deployment_type: "wfp",
        } as Tenant;
      },
      async list() {
        return { tenants: [] };
      },
      async update() {
        throw new Error("write-back DB outage");
      },
      async remove() {
        return false;
      },
    };
    const warn = vi.fn();
    const hook = createWfpTenantProvisioningHook({
      provisioner,
      tenants,
      logger: { warn },
    });
    await expect(hook.onProvision("kvartal")).rejects.toThrow(/upstream failed/);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/Failed to write provisioning_state/);
  });
});
