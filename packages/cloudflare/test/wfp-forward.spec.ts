import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Tenant, TenantsDataAdapter } from "@authhero/adapter-interfaces";
import { createWfpForwardMiddleware } from "../src";

const CONTROL_PLANE = "main";

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "acme",
    name: "Acme",
    deployment_type: "wfp",
    provisioning_state: "ready",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  } as Tenant;
}

/** Minimal tenants adapter exposing just the `get` the middleware calls. */
function tenantsAdapter(
  get: (id: string) => Promise<Tenant | null>,
): TenantsDataAdapter {
  return { get } as unknown as TenantsDataAdapter;
}

/**
 * Build a dispatch namespace whose worker responds with a marker so a test can
 * assert whether the request was dispatched to the tenant worker or served
 * locally. Records every dispatched script name / path.
 */
function dispatcher() {
  const dispatched: { script: string; path: string }[] = [];
  const namespace = {
    get(script: string) {
      return {
        async fetch(req: Request) {
          dispatched.push({ script, path: new URL(req.url).pathname });
          return new Response("from-tenant-worker", { status: 200 });
        },
      };
    },
  };
  return { namespace, dispatched };
}

/** App that dispatches, then serves a local marker for anything not forwarded. */
function buildApp(
  middleware: ReturnType<typeof createWfpForwardMiddleware>,
  env: Record<string, unknown>,
) {
  const app = new Hono();
  app.use(middleware);
  app.all("*", (c) => c.text("from-control-plane", 200));
  return {
    request: (path: string, headers: Record<string, string> = {}) =>
      app.request(path, { headers }, env),
  };
}

describe("createWfpForwardMiddleware localPaths carve-out", () => {
  it("serves /u/widget/* from the control plane instead of dispatching (default)", async () => {
    const { namespace, dispatched } = dispatcher();
    const get = vi.fn(async () => tenant());
    const app = buildApp(
      createWfpForwardMiddleware({
        tenants: tenantsAdapter(get),
        controlPlaneTenantId: CONTROL_PLANE,
      }),
      { DISPATCHER: namespace },
    );

    const res = await app.request("/u/widget/authhero-widget.esm.js?v=abc", {
      "tenant-id": "acme",
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("from-control-plane");
    expect(dispatched).toHaveLength(0);
    // The carve-out short-circuits before the tenant lookup.
    expect(get).not.toHaveBeenCalled();
  });

  it("still dispatches non-carved-out paths for a ready wfp tenant", async () => {
    const { namespace, dispatched } = dispatcher();
    const app = buildApp(
      createWfpForwardMiddleware({
        tenants: tenantsAdapter(async () => tenant()),
        controlPlaneTenantId: CONTROL_PLANE,
      }),
      { DISPATCHER: namespace },
    );

    const res = await app.request("/u2/login?state=xyz", {
      "tenant-id": "acme",
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("from-tenant-worker");
    expect(dispatched).toEqual([
      { script: "tenant-acme-auth", path: "/u2/login" },
    ]);
  });

  it("honours a custom localPaths list", async () => {
    const { namespace, dispatched } = dispatcher();
    const app = buildApp(
      createWfpForwardMiddleware({
        tenants: tenantsAdapter(async () => tenant()),
        controlPlaneTenantId: CONTROL_PLANE,
        localPaths: ["/u/widget/", "/shared-assets/"],
      }),
      { DISPATCHER: namespace },
    );

    const widget = await app.request("/u/widget/foo.js", {
      "tenant-id": "acme",
    });
    const shared = await app.request("/shared-assets/logo.png", {
      "tenant-id": "acme",
    });

    expect(await widget.text()).toBe("from-control-plane");
    expect(await shared.text()).toBe("from-control-plane");
    expect(dispatched).toHaveLength(0);
  });

  it("dispatches /u/widget/* when the carve-out is disabled with []", async () => {
    const { namespace, dispatched } = dispatcher();
    const app = buildApp(
      createWfpForwardMiddleware({
        tenants: tenantsAdapter(async () => tenant()),
        controlPlaneTenantId: CONTROL_PLANE,
        localPaths: [],
      }),
      { DISPATCHER: namespace },
    );

    const res = await app.request("/u/widget/authhero-widget.esm.js", {
      "tenant-id": "acme",
    });

    expect(await res.text()).toBe("from-tenant-worker");
    expect(dispatched).toHaveLength(1);
  });

  it("does not carve out /u/widget/* for the control-plane tenant either (served locally regardless)", async () => {
    const { namespace, dispatched } = dispatcher();
    const app = buildApp(
      createWfpForwardMiddleware({
        tenants: tenantsAdapter(async () => tenant()),
        controlPlaneTenantId: CONTROL_PLANE,
      }),
      { DISPATCHER: namespace },
    );

    const res = await app.request("/u/widget/authhero-widget.esm.js", {
      "tenant-id": CONTROL_PLANE,
    });

    expect(await res.text()).toBe("from-control-plane");
    expect(dispatched).toHaveLength(0);
  });
});
