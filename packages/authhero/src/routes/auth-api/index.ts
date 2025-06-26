import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { callbackRoutes } from "./callback";
import { logoutRoutes } from "./logout";
import { userinfoRoutes } from "./userinfo";
import { wellKnownRoutes } from "./well-known";
import { tokenRoutes } from "./token";
import { dbConnectionRoutes } from "./dbconnections";
import { passwordlessRoutes } from "./passwordless";
import { authenticateRoutes } from "./authenticate";
import { authorizeRoutes } from "./authorize";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";

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

  app.use(
    "/oauth/token",
    cors({
      origin: (origin) => {
        return origin || "";
      },
      allowHeaders: [
        "Tenant-Id",
        "Content-Type",
        "Auth0-Client",
        "Upgrade-Insecure-Requests",
      ],
      allowMethods: ["POST"],
      maxAge: 600,
    }),
  );

  app
    .use(clientInfoMiddleware)
    .use(tenantMiddleware)
    .use(createAuthMiddleware(app));

  const oauthApp = app
    .route("/v2/logout", logoutRoutes)
    .route("/userinfo", userinfoRoutes)
    .route("/.well-known", wellKnownRoutes)
    .route("/oauth/token", tokenRoutes)
    .route("/dbconnections", dbConnectionRoutes)
    .route("/passwordless", passwordlessRoutes)
    .route("/co/authenticate", authenticateRoutes)
    .route("/authorize", authorizeRoutes)
    .route("/callback", callbackRoutes);

  oauthApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Oauth API",
    },
    security: [
      {
        oauth2: ["openid", "email", "profile"],
      },
    ],
  });

  registerComponent(oauthApp);

  return oauthApp;
}
