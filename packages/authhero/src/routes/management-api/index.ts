import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
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
import { guardianRoutes } from "./guardian";
import { authenticationMethodsRoutes } from "./authentication-methods";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { waitUntil } from "../../helpers/wait-until";
import { drainOutbox } from "../../helpers/outbox-relay";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  // Use managementDataAdapter if provided, otherwise fall back to dataAdapter
  const managementAdapter = config.managementDataAdapter ?? config.dataAdapter;

  // Dynamic CORS middleware that fetches allowed origins from clients
  app.use(async (ctx, next) => {
    const origin = ctx.req.header("origin");

    // Helper to set CORS headers
    const setCorsHeaders = (allowedOrigin: string) => {
      ctx.res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
      ctx.res.headers.set(
        "Access-Control-Allow-Headers",
        "Tenant-Id, Content-Type, Content-Range, Auth0-Client, Authorization, Range, Upgrade-Insecure-Requests",
      );
      ctx.res.headers.set(
        "Access-Control-Allow-Methods",
        "POST, PUT, GET, DELETE, PATCH, OPTIONS",
      );
      ctx.res.headers.set(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Range",
      );
      ctx.res.headers.set("Access-Control-Max-Age", "600");
      ctx.res.headers.set("Access-Control-Allow-Credentials", "true");
      ctx.res.headers.append("Vary", "Origin");
    };

    // Handle preflight requests
    if (ctx.req.method === "OPTIONS") {
      const response = new Response(null, { status: 204 });

      if (origin) {
        // Helper to set preflight CORS headers
        const setPreflightCors = (allowedOrigin: string) => {
          response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
          response.headers.set(
            "Access-Control-Allow-Headers",
            "Tenant-Id, Content-Type, Content-Range, Auth0-Client, Authorization, Range, Upgrade-Insecure-Requests",
          );
          response.headers.set(
            "Access-Control-Allow-Methods",
            "POST, PUT, GET, DELETE, PATCH, OPTIONS",
          );
          response.headers.set(
            "Access-Control-Expose-Headers",
            "Content-Length, Content-Range",
          );
          response.headers.set("Access-Control-Max-Age", "600");
          response.headers.set("Access-Control-Allow-Credentials", "true");
          response.headers.append("Vary", "Origin");
        };

        if (config.allowedOrigins?.includes(origin)) {
          setPreflightCors(origin);
          return response;
        }

        // Try to get tenant ID from header to check client web_origins
        const tenantId = ctx.req.header("tenant-id");
        if (tenantId) {
          const clients = await managementAdapter.clients.list(tenantId, {});
          const allWebOrigins = clients.clients.flatMap(
            (client) => client.web_origins || [],
          );
          if (allWebOrigins.includes(origin)) {
            setPreflightCors(origin);
            return response;
          }
        }
      }
      // Return 204 without CORS headers if origin not allowed
      // Still set Vary so caches don't serve this to an allowed origin
      response.headers.append("Vary", "Origin");
      return response;
    }

    // For actual requests, process the request first then set headers
    await next();

    // Always append Vary: Origin so caches differentiate responses by origin
    ctx.res.headers.append("Vary", "Origin");

    if (origin) {
      // Check static allowedOrigins first
      if (config.allowedOrigins?.includes(origin)) {
        setCorsHeaders(origin);
        return;
      }

      // Try to get tenant ID from context (set by tenant middleware)
      const tenantId = ctx.var.tenant_id || ctx.req.header("tenant-id");
      if (tenantId) {
        const clients = await managementAdapter.clients.list(tenantId, {});
        const allWebOrigins = clients.clients.flatMap(
          (client) => client.web_origins || [],
        );
        if (allWebOrigins.includes(origin)) {
          setCorsHeaders(origin);
        }
      }
    }
  });

  registerComponent(app);

  // Apply decorator chain (hooks, caching, timing) on top of base adapters
  const applyDecorators = (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    data: DataAdapters,
  ): DataAdapters => {
    const dataWithHooks = addDataHooks(ctx, data);

    const cacheAdapter = createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

    const cachedData = addCaching(dataWithHooks, {
      defaultTtl: 0,
      cacheEntities: [
        "tenants",
        "connections",
        "clients",
        "branding",
        "themes",
        "promptSettings",
        "customText",
        "forms",
        "hooks",
      ],
      cache: cacheAdapter,
    });

    return addTimingLogs(ctx, cachedData);
  };

  const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

  app.use(async (ctx, next) => {
    const outboxEnabled = ctx.env.outbox?.enabled;
    const isMutating = MUTATING_METHODS.has(ctx.req.method);

    if (outboxEnabled && isMutating) {
      // Wrap the entire request in a transaction so entity writes
      // and outbox event writes are atomic
      await managementAdapter.transaction(async (trxAdapters) => {
        ctx.env.data = applyDecorators(ctx, trxAdapters);
        ctx.env.entityHooks = config.entityHooks;
        await next();
      });
      // Transaction committed — drain outbox in background
      if (managementAdapter.outbox) {
        waitUntil(
          ctx,
          drainOutbox(
            managementAdapter.outbox,
            [new LogsDestination(managementAdapter.logs)],
            {
              maxRetries: ctx.env.outbox?.maxRetries,
              retentionDays: ctx.env.outbox?.retentionDays,
            },
          ),
        );
      }
    } else {
      ctx.env.data = applyDecorators(ctx, managementAdapter);
      ctx.env.entityHooks = config.entityHooks;
      await next();
    }
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

  // Collect extension paths to avoid mounting core routes that would conflict
  const extensionPaths = new Set(
    config.managementApiExtensions?.map((e) => e.path) || [],
  );

  const managementApp = app
    .route("/branding", brandingRoutes)
    .route("/custom-domains", customDomainRoutes)
    .route("/email/providers", emailProviderRoutes)
    .route("/users", userRoutes)
    .route("/keys", keyRoutes)
    .route("/users-by-email", usersByEmailRoutes)
    .route("/clients", clientRoutes)
    .route("/client-grants", clientGrantRoutes)
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
    .route("/stats", statsRoutes)
    .route("/guardian", guardianRoutes)
    .route(
      "/users/:user_id/authentication-methods",
      authenticationMethodsRoutes,
    );

  // Only mount core tenant routes if no extension overrides /tenants
  if (!extensionPaths.has("/tenants")) {
    managementApp.route("/tenants", tenantRoutes);
  }

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
