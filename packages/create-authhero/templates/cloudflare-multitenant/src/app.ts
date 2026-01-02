import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { swaggerUI } from "@hono/swagger-ui";
import {
  init,
  MultiTenantAuthHeroConfig,
  DataAdapters,
} from "@authhero/multi-tenancy";

// Control plane tenant ID - the tenant that manages all other tenants
const CONTROL_PLANE_TENANT_ID = "control_plane";

export default function createApp(
  config: Omit<MultiTenantAuthHeroConfig, "controlPlaneTenantId"> & {
    dataAdapter: DataAdapters;
  },
) {
  const { app } = init({
    ...config,
    controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
    // Sync resource servers from control plane tenant to all child tenants
    syncResourceServers: true,
    // Sync roles from control plane tenant to all child tenants
    syncRoles: true,
  });

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
