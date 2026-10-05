import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import createAdapters from "@authhero/kysely-adapter";
import { DataAdapters, init } from "authhero";
import { setupMultiTenancy } from "../src/index";
import { MultiTenancyBindings, MultiTenancyVariables } from "../src/types";
import { createMigratedDb } from "./helpers/migrated-db";

const TENANT = "tenant-a";
const HOST = `${TENANT}.auth.example.com`;

function spyOnTenantsGet(adapters: DataAdapters) {
  const get = vi.fn(adapters.tenants.get);
  return {
    adapters: { ...adapters, tenants: { ...adapters.tenants, get } },
    get,
  };
}

/**
 * `databaseIsolation.getAdapters` must decide which database serves a request,
 * for every authhero route group. Tenant A exists only in its own database, so
 * a route group that reads the startup `dataAdapter` instead answers 404
 * "Tenant not found" from authhero's tenant middleware.
 */
describe("database isolation adapter selection", () => {
  let shared: ReturnType<typeof spyOnTenantsGet>;
  let isolated: ReturnType<typeof spyOnTenantsGet>;
  let env: MultiTenancyBindings;
  let app: Hono<{
    Bindings: MultiTenancyBindings;
    Variables: MultiTenancyVariables;
  }>;

  beforeEach(async () => {
    shared = spyOnTenantsGet(createAdapters(await createMigratedDb()));
    isolated = spyOnTenantsGet(createAdapters(await createMigratedDb()));

    await isolated.adapters.tenants.create({
      id: TENANT,
      friendly_name: "Tenant A",
      audience: "https://tenant-a.example.com",
      sender_email: "admin@example.com",
      sender_name: "Tenant A",
    });
    isolated.get.mockClear();

    const multiTenancy = setupMultiTenancy({
      subdomainRouting: {
        baseDomain: "auth.example.com",
        resolveSubdomain: async (subdomain) => subdomain,
      },
      databaseIsolation: {
        getAdapters: async (tenantId) =>
          tenantId === TENANT ? isolated.adapters : shared.adapters,
      },
    });

    const { app: authheroApp } = init({ dataAdapter: shared.adapters });

    app = new Hono<{
      Bindings: MultiTenancyBindings;
      Variables: MultiTenancyVariables;
    }>();
    app.use("*", multiTenancy.middleware);
    app.route("/", authheroApp);

    // One object for every request, like the isolate-shared `env` on Workers.
    env = {
      data: shared.adapters,
      ISSUER: "https://auth.example.com/",
      AUTH_URL: "https://auth.example.com",
      ENVIRONMENT: "test",
    };
  });

  it("serves the auth-api from the tenant's database", async () => {
    const res = await app.request(
      "/.well-known/openid-configuration",
      { headers: { "x-forwarded-host": HOST } },
      env,
    );

    expect(res.status).toBe(200);
    expect(isolated.get).toHaveBeenCalledWith(TENANT);
    expect(shared.get).not.toHaveBeenCalledWith(TENANT);
    expect(env.data).toBe(shared.adapters);
  });

  it("serves routes that never compose from the tenant's database", async () => {
    // `GET /` reads the request's baseline adapter; with no tenant rows it
    // redirects to the setup wizard. Only the tenant's database has one.
    const res = await app.request(
      "/",
      { headers: { "x-forwarded-host": HOST } },
      env,
    );

    expect(res.status).toBe(200);
    expect(env.data).toBe(shared.adapters);
  });

  it("serves the management API from the tenant's database", async () => {
    const res = await app.request(
      "/api/v2/users",
      { headers: { "x-forwarded-host": HOST } },
      env,
    );

    // Past tenant resolution, stopped by the missing bearer token.
    expect(res.status).toBe(401);
    expect(isolated.get).toHaveBeenCalledWith(TENANT);
    expect(shared.get).not.toHaveBeenCalledWith(TENANT);
    expect(env.data).toBe(shared.adapters);
  });
});
