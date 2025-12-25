import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import {
  setupMultiTenancy,
  createResourceServerSyncHooks,
  createTenantResourceServerSyncHooks,
} from "@authhero/multi-tenancy";

// Main tenant ID - the tenant that manages all other tenants
const MAIN_TENANT_ID = "main";

export default function createApp(config: AuthHeroConfig) {
  // Multi-tenancy setup with tenant CRUD routes
  const multiTenancy = setupMultiTenancy({
    accessControl: {
      mainTenantId: MAIN_TENANT_ID,
      requireOrganizationMatch: false,
      defaultPermissions: ["tenant:admin"],
    },
    settingsInheritance: {
      inheritFromMain: true,
    },
  });

  // Resource server sync hooks (syncs from main tenant to child tenants)
  const resourceServerHooks = createResourceServerSyncHooks({
    mainTenantId: MAIN_TENANT_ID,
    getChildTenantIds: async () => {
      const result = await config.dataAdapter.tenants.list({ per_page: 100 });
      return result.tenants
        .filter((t) => t.id !== MAIN_TENANT_ID)
        .map((t) => t.id);
    },
    getAdapters: async () => config.dataAdapter,
  });

  // Tenant creation hooks (copies resource servers to new tenants)
  const tenantResourceServerSync = createTenantResourceServerSyncHooks({
    mainTenantId: MAIN_TENANT_ID,
    getMainTenantAdapters: async () => config.dataAdapter,
    getAdapters: async () => config.dataAdapter,
  });

  const { app, managementApp } = init({
    ...config,
    entityHooks: {
      ...config.entityHooks,
      resourceServers: resourceServerHooks,
      tenants: tenantResourceServerSync,
    },
  });

  // Mount multi-tenancy tenant management routes (list, create, update, delete)
  // Routes are available at /api/v2/tenants
  managementApp.route("", multiTenancy.app);

  app
    .onError((err, ctx) => {
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      console.error(err);
      return ctx.text(err.message, 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Multi-Tenant Server",
        version: "1.0.0",
        status: "running",
        docs: "/docs",
        mainTenant: MAIN_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
