import { OpenAPIHono } from "@hono/zod-openapi";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper";
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
    // Then wrap with caching (specifically for tenants, connections, and clients)
    const cachedData = addCaching(dataWithHooks, {
      defaultTtl: 300000, // 5 minutes default TTL
      cacheEntities: ["tenants", "connections", "clients"],
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
