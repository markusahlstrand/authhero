import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { Bindings, Variables, AuthHeroConfig } from "../../types";
import { brandingRoutes } from "./branding";
import { userRoutes } from "./users";
import { keyRoutes } from "./keys";
import { usersByEmailRoutes } from "./users-by-email";
import { clientRoutes } from "./clients";
import { tenantRoutes } from "./tenants";
import { logRoutes } from "./logs";
import { hooksRoutes } from "./hooks";
import { connectionRoutes } from "./connections";
import { promptsRoutes } from "./prompts";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { emailProviderRoutes } from "./emails";
import { sessionsRoutes } from "./sessions";
import { refreshTokensRoutes } from "./refresh_tokens";
import { customDomainRoutes } from "./custom-domains";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { tenantMiddleware } from "../../middlewares/tenant";
import { addCaching } from "../../helpers/cache-wrapper";
import { formsRoutes } from "./forms";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app.use(
    cors({
      origin: (origin) => {
        if (!origin) {
          return "";
        }
        if (config.allowedOrigins?.includes(origin)) {
          return origin;
        }
        return "";
      },
      allowHeaders: [
        "Tenant-Id",
        "Content-Type",
        "Content-Range",
        "Auth0-Client",
        "Authorization",
        "Range",
        "Upgrade-Insecure-Requests",
      ],
      allowMethods: ["POST", "PUT", "GET", "DELETE", "PATCH", "OPTIONS"],
      exposeHeaders: ["Content-Length", "Content-Range"],
      maxAge: 600,
      credentials: true,
    }),
  );

  registerComponent(app);

  app.use(async (ctx, next) => {
    // First add data hooks
    const dataWithHooks = addDataHooks(ctx, config.dataAdapter);
    // Then wrap with caching (specifically for tenants, connections, and clients)
    const cachedData = addCaching(dataWithHooks, {
      defaultTtl: 0, // 0 minutes default TTL
      cacheEntities: ["tenants", "connections", "clients"],
    });
    // Finally wrap with timing logs
    ctx.env.data = addTimingLogs(ctx, cachedData);
    return next();
  });

  app.use(tenantMiddleware).use(createAuthMiddleware(app));

  const managementApp = app
    .route("/branding", brandingRoutes)
    .route("/custom-domains", customDomainRoutes)
    .route("/email/providers", emailProviderRoutes)
    .route("/users", userRoutes)
    .route("/keys", keyRoutes)
    .route("/users-by-email", usersByEmailRoutes)
    .route("/clients", clientRoutes)
    .route("/tenants", tenantRoutes)
    .route("/logs", logRoutes)
    .route("/hooks", hooksRoutes)
    .route("/connections", connectionRoutes)
    .route("/prompts", promptsRoutes)
    .route("/sessions", sessionsRoutes)
    .route("/refresh_tokens", refreshTokensRoutes)
    .route("/forms", formsRoutes);

  managementApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Management API",
    },
    servers: [
      {
        url: "/api/v2",
        description: "API V2",
      },
    ],
    security: [
      {
        oauth2: ["openid", "email", "profile"],
      },
    ],
  });

  return managementApp;
}
