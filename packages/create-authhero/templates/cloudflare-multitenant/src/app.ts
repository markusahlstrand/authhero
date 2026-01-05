import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { swaggerUI } from "@hono/swagger-ui";
import { init, AuthHeroConfig, fetchAll } from "authhero";
import {
  createSyncHooks,
  createTenantsOpenAPIRouter,
  createProtectSyncedMiddleware,
} from "@authhero/multi-tenancy";
import { DataAdapters } from "@authhero/adapter-interfaces";

// Control plane tenant ID - the tenant that manages all other tenants
const CONTROL_PLANE_TENANT_ID = "control_plane";

export default function createApp(config: AuthHeroConfig & { dataAdapter: DataAdapters }) {
  // Create sync hooks for syncing entities from control plane to child tenants
  const { entityHooks, tenantHooks } = createSyncHooks({
    controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
    getChildTenantIds: async () => {
      const allTenants = await fetchAll<{ id: string }>(
        (params) => config.dataAdapter.tenants.list(params),
        "tenants",
        { cursorField: "id", pageSize: 100 },
      );
      return allTenants
        .filter((t) => t.id !== CONTROL_PLANE_TENANT_ID)
        .map((t) => t.id);
    },
    getAdapters: async () => config.dataAdapter,
    getControlPlaneAdapters: async () => config.dataAdapter,
    sync: {
      resourceServers: true,
      roles: true,
      connections: true,
    },
  });

  // Create tenants router
  const tenantsRouter = createTenantsOpenAPIRouter(
    {
      accessControl: {
        controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
        requireOrganizationMatch: false,
        defaultPermissions: ["tenant:admin"],
      },
    },
    { tenants: tenantHooks },
  );

  // Initialize AuthHero with sync hooks and tenant routes
  const { app } = init({
    ...config,
    entityHooks,
    managementApiExtensions: [
      ...(config.managementApiExtensions || []),
      { path: "/tenants", router: tenantsRouter },
    ],
  });

  // Add middleware to protect synced entities from modification on child tenants
  app.use("/api/v2/*", createProtectSyncedMiddleware());

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
        controlPlaneTenant: CONTROL_PLANE_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
