import { OpenAPIHono } from "@hono/zod-openapi";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper-v2";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { samlpRoutes } from "./samlp";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app.use(async (ctx, next) => {
    // First add data hooks
    const dataWithHooks = addDataHooks(ctx, config.dataAdapter);

    // Use provided cache adapter or create request-scoped cache as fallback
    const cacheAdapter =
      config.dataAdapter.cache ||
      createInMemoryCache({
        defaultTtlSeconds: 0, // No TTL for request-scoped cache
        maxEntries: 100, // Smaller limit since it's per-request
        cleanupIntervalMs: 0, // Disable cleanup since cache dies with the request
      });

    // TTL strategy: if using provided cache adapter, use longer TTL; if request-scoped, use 0
    const defaultTtl = config.dataAdapter.cache ? 300 : 0; // 5 minutes for persistent, 0 for request-scoped

    // Then wrap with caching for commonly accessed read-only entities
    const cachedData = addCaching(dataWithHooks, {
      defaultTtl,
      cacheEntities: [
        "tenants",
        "connections",
        "clients",
        "branding",
        "themes",
        "promptSettings",
        "forms",
      ],
      cache: cacheAdapter,
    });

    // Finally wrap with timing logs
    ctx.env.data = addTimingLogs(ctx, cachedData);
    return next();
  });

  app
    .use(clientInfoMiddleware)
    .use(tenantMiddleware)
    .use(createAuthMiddleware(app));

  const samlApp = app.route("/", samlpRoutes);

  samlApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "SAML API",
    },
    security: [
      {
        oauth2: ["openid", "email", "profile"],
      },
    ],
  });

  registerComponent(samlApp);

  return samlApp;
}
