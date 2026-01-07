import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig } from "authhero";
import { initMultiTenant } from "@authhero/multi-tenancy";
import { DataAdapters } from "@authhero/adapter-interfaces";

// Control plane tenant ID - the tenant that manages all other tenants
const CONTROL_PLANE_TENANT_ID = "control_plane";

export default function createApp(config: AuthHeroConfig & { dataAdapter: DataAdapters }) {
  // Initialize multi-tenant AuthHero with sensible defaults
  const { app } = initMultiTenant({
    ...config,
    controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
    // Sync resource servers, roles, and connections from control plane to child tenants
    sync: {
      resourceServers: true,
      roles: true,
      connections: true,
    },
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
