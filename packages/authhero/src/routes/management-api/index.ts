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
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { addCaching } from "../../helpers/cache-wrapper";
import { addEntityHooks } from "../../helpers/entity-hooks-wrapper";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { formsRoutes } from "./forms";
import { flowsRoutes } from "./flows";
import { roleRoutes } from "./roles";
import { resourceServerRoutes } from "./resource-servers";
import { clientGrantRoutes } from "./client-grants";
import { organizationRoutes } from "./organizations";
import { statsRoutes } from "./stats";

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

  // Use managementDataAdapter if provided, otherwise fall back to dataAdapter
  const managementAdapter = config.managementDataAdapter ?? config.dataAdapter;

  app.use(async (ctx, next) => {
    // First add data hooks (for user operations)
    const dataWithHooks = addDataHooks(ctx, managementAdapter);

    // Management API always uses request-scoped caching for data freshness
    const cacheAdapter = createInMemoryCache({
      defaultTtlSeconds: 0, // No TTL for request-scoped cache
      maxEntries: 100, // Smaller limit since it's per-request
      cleanupIntervalMs: 0, // Disable cleanup since cache dies with the request
    });

    // Then wrap with caching for commonly accessed read-only entities
    const cachedData = addCaching(dataWithHooks, {
      defaultTtl: 0, // Always use request-scoped caching for management API
      cacheEntities: [
        "tenants",
        "connections",
        "clients",
        "legacyClients",
        "branding",
        "themes",
        "promptSettings",
        "forms",
      ],
      cache: cacheAdapter,
    });

    // Store cached data initially - entity hooks will be added after tenant is known
    ctx.env.data = addTimingLogs(ctx, cachedData);

    // Store config for entity hooks (to be applied after tenant middleware)
    ctx.env.entityHooks = config.entityHooks;

    return next();
  });

  app
    .use(clientInfoMiddleware)
    .use(tenantMiddleware)
    .use(createAuthMiddleware(app))
    // Add entity hooks after tenant is known
    .use(async (ctx, next) => {
      if (config.entityHooks && ctx.var.tenant_id) {
        ctx.env.data = addEntityHooks(ctx.env.data, {
          tenantId: ctx.var.tenant_id,
          entityHooks: config.entityHooks,
        });
      }
      return next();
    });

  const managementApp = app
    .route("/branding", brandingRoutes)
    .route("/custom-domains", customDomainRoutes)
    .route("/email/providers", emailProviderRoutes)
    .route("/users", userRoutes)
    .route("/keys", keyRoutes)
    .route("/users-by-email", usersByEmailRoutes)
    .route("/clients", clientRoutes)
    .route("/client-grants", clientGrantRoutes)
    .route("/tenants", tenantRoutes)
    .route("/logs", logRoutes)
    .route("/hooks", hooksRoutes)
    .route("/connections", connectionRoutes)
    .route("/prompts", promptsRoutes)
    .route("/sessions", sessionsRoutes)
    .route("/refresh_tokens", refreshTokensRoutes)
    .route("/forms", formsRoutes)
    .route("/flows", flowsRoutes)
    .route("/roles", roleRoutes)
    .route("/resource-servers", resourceServerRoutes)
    .route("/organizations", organizationRoutes)
    .route("/stats", statsRoutes);

  // Mount any additional route extensions from config
  // These go through the full middleware chain (caching, tenant, auth, entity hooks)
  if (config.managementApiExtensions) {
    for (const extension of config.managementApiExtensions) {
      managementApp.route(extension.path, extension.router);
    }
  }

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
