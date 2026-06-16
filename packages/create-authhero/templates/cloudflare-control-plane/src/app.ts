import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import {
  initMultiTenant,
  type ControlPlaneRolloutAdapter,
} from "@authhero/multi-tenancy";

// Control plane configuration. Tenants inherit this tenant's defaults.
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default";

export default function createApp(
  config: AuthHeroConfig & { dataAdapter: DataAdapters },
  rollout: ControlPlaneRolloutAdapter,
) {
  // initMultiTenant syncs resource servers and roles, mounts /api/v2/tenants,
  // and wraps adapters with runtime fallback for colocated tenants.
  const { app } = initMultiTenant({
    ...config,
    controlPlane: {
      tenantId: CONTROL_PLANE_TENANT_ID,
      clientId: CONTROL_PLANE_CLIENT_ID,
    },
  });

  app
    .onError((err, ctx) => {
      // Duck-typing avoids instanceof issues with bundled dependencies.
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(
        err instanceof Error ? err.message : "Internal Server Error",
        500,
      );
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Control Plane",
        status: "running",
        docs: "/docs",
        controlPlaneTenant: CONTROL_PLANE_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Project the control plane defaults into a WFP tenant's own database.
    // Call after a tenant is provisioned, and after rotating shared secrets.
    //
    // ⚠️  Protect this route before production (service binding, mTLS, or an
    // admin token). It re-keys tenant databases.
    .post("/internal/tenants/:id/sync-defaults", async (ctx: Context) => {
      try {
        const result = await rollout.syncDefaults(ctx.req.param("id"));
        return ctx.json({ ok: true, result });
      } catch (err) {
        return ctx.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          },
          501,
        );
      }
    });

  return app;
}
