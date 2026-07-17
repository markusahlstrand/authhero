import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import createAdapters from "@authhero/kysely-adapter";
import {
  setupMultiTenancy,
  createTenantsOpenAPIRouter,
  MultiTenancyConfig,
  MultiTenancyHooks,
} from "../src/index";
import { isExternalDependency } from "../build-externals";
import { createMigratedDb } from "./helpers/migrated-db";

const controlPlaneTenantId = "control_plane";

type TestUser = {
  sub: string;
  tenant_id: string;
  scope?: string;
  permissions?: string[];
  org_id?: string;
};

type AppOptions = {
  hooks: MultiTenancyHooks;
  config: MultiTenancyConfig;
  /** Variables set on the request context, simulating the auth middleware. */
  user?: TestUser;
  org_name?: string;
  organization_id?: string;
};

/**
 * Builds a host Hono app that mounts the tenants router and translates errors
 * the way a real host app does: `instanceof HTTPException` keeps the intended
 * status, everything else becomes a generic 500. This is the exact check that
 * silently fails when a second copy of Hono is bundled into the package — a
 * thrown 403 would not be an instance of the host's HTTPException and would
 * leak out as a 500.
 */
function createHostApp(options: AppOptions) {
  const app = new Hono<{
    Bindings: { data: ReturnType<typeof createAdapters> };
    Variables: Record<string, unknown>;
  }>();

  app.use("*", async (c, next) => {
    c.set("tenant_id", controlPlaneTenantId);
    if (options.user) c.set("user", options.user);
    if (options.org_name) c.set("org_name", options.org_name);
    if (options.organization_id) {
      c.set("organization_id", options.organization_id);
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ message: err.message }, err.status);
    }
    return c.json({ message: "server error" }, 500);
  });

  app.route(
    "/management/tenants",
    createTenantsOpenAPIRouter(options.config, options.hooks),
  );

  return app;
}

describe("tenants routes authorization", () => {
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };

  const accessControlConfig: MultiTenancyConfig = {
    accessControl: {
      controlPlaneTenantId,
      requireOrganizationMatch: true,
    },
  };

  beforeEach(async () => {
    const db = await createMigratedDb();
    adapters = createAdapters(db);
    env = { data: adapters };

    await adapters.tenants.create({
      id: controlPlaneTenantId,
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });
  });

  async function createChildTenant(id: string) {
    await adapters.tenants.create({
      id,
      friendly_name: id,
      audience: `https://${id}.example.com`,
      sender_email: `admin@${id}.example.com`,
      sender_name: id,
    });
  }

  it("returns 403 (not 500) when the caller is denied access to a tenant", async () => {
    await createChildTenant("orphan-tenant");

    const { hooks } = setupMultiTenancy(accessControlConfig);

    // Authenticated, but no org claim, no membership and no admin scope.
    const app = createHostApp({
      config: accessControlConfig,
      hooks,
      user: { sub: "auth0|nobody", tenant_id: controlPlaneTenantId },
    });

    const response = await app.request(
      "/management/tenants/orphan-tenant",
      { method: "DELETE" },
      env,
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe("Access denied to this tenant");

    // The tenant must still exist — a denied delete must not remove anything.
    expect(await adapters.tenants.get("orphan-tenant")).not.toBeNull();
  });

  it("lets a control-plane admin with delete:tenants delete any tenant", async () => {
    await createChildTenant("any-tenant");

    const { hooks } = setupMultiTenancy(accessControlConfig);

    // Super-admin token: scoped to the control plane, no org claim, carrying
    // the delete:tenants scope. It is not a member of any tenant organization.
    const app = createHostApp({
      config: accessControlConfig,
      hooks,
      user: {
        sub: "auth0|super-admin",
        tenant_id: controlPlaneTenantId,
        scope: "read:tenants delete:tenants",
      },
    });

    const response = await app.request(
      "/management/tenants/any-tenant",
      { method: "DELETE" },
      env,
    );

    expect(response.status).toBe(204);
    expect(await adapters.tenants.get("any-tenant")).toBeNull();
  });

  it("does not let an org-scoped token delete a different tenant via the scope", async () => {
    await createChildTenant("other-tenant");

    const { hooks } = setupMultiTenancy(accessControlConfig);

    // The token carries delete:tenants but is scoped to organization
    // "own-tenant" — it must not be able to delete "other-tenant".
    const app = createHostApp({
      config: accessControlConfig,
      hooks,
      user: {
        sub: "auth0|org-admin",
        tenant_id: controlPlaneTenantId,
        scope: "delete:tenants",
        org_id: "org_own",
      },
      org_name: "own-tenant",
    });

    const response = await app.request(
      "/management/tenants/other-tenant",
      { method: "DELETE" },
      env,
    );

    expect(response.status).toBe(403);
    expect(await adapters.tenants.get("other-tenant")).not.toBeNull();
  });

  it("makes a tenant created via the API deletable by its creator", async () => {
    const creatorId = "auth0|creator";

    // The creator exists on the control plane (gets added to the new tenant's
    // organization by the provisioning hook).
    await adapters.users.create(controlPlaneTenantId, {
      user_id: creatorId,
      email: "creator@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth0",
      is_social: false,
      login_count: 0,
    });

    // Provisioning hooks create the control-plane organization for the tenant
    // and add the creator as a member — keeping create and delete symmetric.
    const config: MultiTenancyConfig = {
      accessControl: {
        controlPlaneTenantId,
        requireOrganizationMatch: true,
        addCreatorToOrganization: true,
      },
    };
    const { hooks } = setupMultiTenancy(config);

    const creator: TestUser = {
      sub: creatorId,
      tenant_id: controlPlaneTenantId,
    };

    const app = createHostApp({ config, hooks, user: creator });

    const createResponse = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "created-tenant",
          friendly_name: "Created Tenant",
          audience: "https://created-tenant.example.com",
          sender_email: "admin@created-tenant.example.com",
          sender_name: "Created Tenant",
        }),
      },
      env,
    );
    expect(createResponse.status).toBe(201);

    // The creator deletes the tenant they just created. They have no org_name
    // claim, so this exercises the org-membership fallback.
    const deleteResponse = await app.request(
      "/management/tenants/created-tenant",
      { method: "DELETE" },
      env,
    );

    expect(deleteResponse.status).toBe(204);
    expect(await adapters.tenants.get("created-tenant")).toBeNull();
  });
});

describe("tenant settings: default_client_id validation", () => {
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };

  const config: MultiTenancyConfig = {
    accessControl: {
      controlPlaneTenantId,
      requireOrganizationMatch: true,
    },
  };

  beforeEach(async () => {
    const db = await createMigratedDb();
    adapters = createAdapters(db);
    env = { data: adapters };

    await adapters.tenants.create({
      id: controlPlaneTenantId,
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });
  });

  function settingsApp() {
    const { hooks } = setupMultiTenancy(config);
    return createHostApp({
      config,
      hooks,
      user: {
        sub: "auth0|admin",
        tenant_id: controlPlaneTenantId,
        scope: "update:tenants",
      },
    });
  }

  async function patchSettings(
    app: ReturnType<typeof settingsApp>,
    body: unknown,
  ) {
    return app.request(
      "/management/tenants/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  }

  it("rejects a default_client_id that does not exist", async () => {
    const app = settingsApp();

    const response = await patchSettings(app, {
      default_client_id: "does-not-exist",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("does-not-exist");
    expect(
      (await adapters.tenants.get(controlPlaneTenantId))!.default_client_id,
    ).toBeFalsy();
  });

  it("rejects a non-interactive (M2M) client as the default", async () => {
    await adapters.clients.create(controlPlaneTenantId, {
      client_id: "m2m",
      client_secret: "s",
      name: "M2M",
      app_type: "non_interactive",
      grant_types: ["client_credentials"],
    });
    const app = settingsApp();

    const response = await patchSettings(app, { default_client_id: "m2m" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("interactive");
    expect(
      (await adapters.tenants.get(controlPlaneTenantId))!.default_client_id,
    ).toBeFalsy();
  });

  it("accepts an interactive client as the default", async () => {
    await adapters.clients.create(controlPlaneTenantId, {
      client_id: "web",
      client_secret: "s",
      name: "Web",
      app_type: "regular_web",
      grant_types: ["authorization_code"],
    });
    const app = settingsApp();

    const response = await patchSettings(app, { default_client_id: "web" });

    expect(response.status).toBe(200);
    expect(
      (await adapters.tenants.get(controlPlaneTenantId))!.default_client_id,
    ).toBe("web");
  });

  it("allows clearing default_client_id with an empty string", async () => {
    await adapters.clients.create(controlPlaneTenantId, {
      client_id: "web",
      client_secret: "s",
      name: "Web",
      app_type: "regular_web",
      grant_types: ["authorization_code"],
    });
    await adapters.tenants.update(controlPlaneTenantId, {
      default_client_id: "web",
    });
    const app = settingsApp();

    const response = await patchSettings(app, { default_client_id: "" });

    expect(response.status).toBe(200);
    expect(
      (await adapters.tenants.get(controlPlaneTenantId))!.default_client_id,
    ).toBeFalsy();
  });
});

describe("build: Hono is not bundled into the output", () => {
  it("treats hono and its subpath exports as external", () => {
    // Regression for the duplicate-Hono bug: the bare package was external but
    // the subpath import (hono/http-exception) was not, so a second copy of
    // HTTPException was inlined.
    expect(isExternalDependency("hono")).toBe(true);
    expect(isExternalDependency("hono/http-exception")).toBe(true);
    expect(isExternalDependency("@hono/zod-openapi")).toBe(true);
    expect(isExternalDependency("zod")).toBe(true);
    expect(isExternalDependency("authhero")).toBe(true);

    // Unrelated packages stay bundled.
    expect(isExternalDependency("better-sqlite3")).toBe(false);
    expect(isExternalDependency("honolulu")).toBe(false);
  });

  it("does not inline Hono's http-exception into the built bundle", () => {
    const distDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist",
    );

    let checked = 0;
    for (const file of ["multi-tenancy.mjs", "multi-tenancy.cjs"]) {
      const bundlePath = path.join(distDir, file);
      if (!existsSync(bundlePath)) continue; // skip individual missing artifacts
      const contents = readFileSync(bundlePath, "utf8");
      expect(contents).not.toContain("hono/dist/http-exception");
      expect(contents).not.toContain("class HTTPException");
      checked++;
    }

    // Require the package to have been built so this regression check actually runs.
    expect(checked).toBeGreaterThan(0);
  });
});
