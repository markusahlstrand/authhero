import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { swaggerUI } from "@hono/swagger-ui";
import {
  init,
  MultiTenantAuthHeroConfig,
  DataAdapters,
} from "@authhero/multi-tenancy";

// Main tenant ID - the tenant that manages all other tenants
const MAIN_TENANT_ID = "main";

export default function createApp(
  config: Omit<MultiTenantAuthHeroConfig, "mainTenantId"> & {
    dataAdapter: DataAdapters;
  },
) {
  const { app } = init({
    ...config,
    mainTenantId: MAIN_TENANT_ID,
    // Sync resource servers from main tenant to all child tenants
    syncResourceServers: true,
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
        mainTenant: MAIN_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
