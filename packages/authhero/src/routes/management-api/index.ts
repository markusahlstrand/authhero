import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables, AuthHeroConfig } from "../../types";
import { logMessage } from "../../helpers/logging";
import { actionsRoutes } from "./actions";
import { actionExecutionsRoutes } from "./action-executions";
import { actionTriggersRoutes } from "./action-triggers";
import { brandingRoutes } from "./branding";
import { userRoutes } from "./users";
import { keyRoutes } from "./keys";
import { usersByEmailRoutes } from "./users-by-email";
import { clientRoutes } from "./clients";
import { tenantRoutes } from "./tenants";
import { logRoutes } from "./logs";
import { failedEventsRoutes } from "./failed-events";
import { hooksRoutes } from "./hooks";
import { hookCodeRoutes } from "./hook-code";
import { connectionRoutes } from "./connections";
import { promptsRoutes } from "./prompts";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { emailProviderRoutes } from "./emails";
import { emailTemplatesRoutes } from "./email-templates";
import { sessionsRoutes } from "./sessions";
import { refreshTokensRoutes } from "./refresh_tokens";
import { customDomainRoutes } from "./custom-domains";
import { logStreamsRoutes } from "./log-streams";
import { migrationSourcesRoutes } from "./migration-sources";
import { attackProtectionRoutes } from "./attack-protection";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { preferMiddleware } from "../../middlewares/prefer";
import { addCaching } from "../../helpers/cache-wrapper";
import { addEntityHooks } from "../../helpers/entity-hooks-wrapper";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { formsRoutes } from "./forms";
import { flowsRoutes } from "./flows";
import { roleRoutes } from "./roles";
import { resourceServerRoutes } from "./resource-servers";
import { clientGrantRoutes } from "./client-grants";
import { clientRegistrationTokenRoutes } from "./client-registration-tokens";
import { organizationRoutes } from "./organizations";
import { statsRoutes } from "./stats";
import { createAnalyticsRoutes } from "./analytics";
import { guardianRoutes } from "./guardian";
import { authenticationMethodsRoutes } from "./authentication-methods";
import { ticketsRoutes } from "./tickets";
import { proxyRoutesRoutes } from "./proxy-routes";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { LogStreamDestination } from "../../helpers/outbox-destinations/log-streams";
import { WebhookDestination } from "../../helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../helpers/outbox-destinations/registration-finalizer";
import { ControlPlaneSyncDestination } from "../../helpers/outbox-destinations/control-plane-sync";
import { createServiceToken } from "../../helpers/service-token";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  // Use managementDataAdapter if provided, otherwise fall back to dataAdapter
  const managementAdapter = config.managementDataAdapter ?? config.dataAdapter;

  app.use(applyConfigMiddleware(config));

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

  // Auth0 SDKs (e.g. terraform-provider-auth0 via go-auth0) parse error bodies
  // strictly as { statusCode, error, message, errorCode }. Cover the two cases
  // authhero produces by default that aren't that shape: (1) plaintext from
  // HTTPException, (2) zod-openapi's default validation-failure JSON.
  app.onError((err, ctx) => {
    if (!(err instanceof HTTPException)) {
      // Let the parent app's onError do its thing (logging, 500 response).
      throw err;
    }
    const status = err.status;
    if (status < 400 || status >= 500) throw err;

    // If the exception already carries a Response (e.g. JSONHTTPException
    // sets a JSON body), pass it through untouched. Only wrap the bare
    // HTTPException case where the message was meant to be a plaintext body.
    const existing = err.getResponse();
    if (existing.headers.get("content-type")?.includes("application/json")) {
      return existing;
    }
    const errorTextByStatus: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      405: "Method Not Allowed",
      409: "Conflict",
      422: "Unprocessable Entity",
      429: "Too Many Requests",
    };
    return ctx.json(
      {
        statusCode: status,
        error: errorTextByStatus[status] ?? "Error",
        message: err.message || errorTextByStatus[status] || "Error",
      },
      status as 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429,
    );
  });

  // Translate @hono/zod-openapi's default validation-failure JSON
  // ({ success: false, error: { issues, name: "ZodError" } }) into Auth0's
  // shape so SDK callers get a readable message instead of an unmarshal error.
  app.use(async (ctx, next) => {
    await next();
    if (
      ctx.res.status !== 400 ||
      !ctx.res.headers.get("content-type")?.includes("application/json")
    ) {
      return;
    }
    let body: unknown;
    try {
      body = await ctx.res.clone().json();
    } catch {
      return;
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("success" in body) ||
      body.success !== false ||
      !("error" in body) ||
      typeof body.error !== "object" ||
      body.error === null ||
      !("name" in body.error) ||
      body.error.name !== "ZodError"
    ) {
      return;
    }
    const issues =
      "issues" in body.error && Array.isArray(body.error.issues)
        ? (body.error.issues as Array<{ path?: unknown; message?: string }>)
        : [];
    const message = issues.length
      ? `Payload validation error: ${issues
          .map((i) => {
            const segments = Array.isArray(i.path) ? i.path : [];
            const pathStr = segments.length ? segments.join(".") : "root";
            return `'${pathStr}': ${i.message ?? "invalid"}`;
          })
          .join("; ")}`
      : "Payload validation error";
    ctx.res = new Response(
      JSON.stringify({
        statusCode: 400,
        error: "Bad Request",
        message,
        errorCode: "invalid_body",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  });

  registerComponent(app);

  // Share the cache adapter with the other apps (u2/auth-api/universal-login/saml)
  // so management-api writes invalidate entries those apps may have cached.
  // Without this, a PATCH to /api/v2/clients/:id would update the row but leave
  // u2/auth-api serving the stale enriched client for up to 300s.
  const cacheAdapter =
    config.dataAdapter.cache ||
    createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

  // Apply decorator chain (hooks, caching, timing) on top of base adapters
  const applyDecorators = (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    data: DataAdapters,
  ): DataAdapters => {
    const dataWithHooks = addDataHooks(ctx, data);

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

  app.use(
    outboxMiddleware({
      getOutbox: () => managementAdapter.outbox,
      getDestinations: (ctx) => [
        new LogsDestination(managementAdapter.logs),
        ...(managementAdapter.logStreams
          ? [new LogStreamDestination(managementAdapter.logStreams)]
          : []),
        new WebhookDestination(managementAdapter.hooks, async (tenantId) => {
          const token = await createServiceToken(ctx, tenantId, "webhook");
          return token.access_token;
        }),
        ...(config.controlPlaneSync
          ? [
              new ControlPlaneSyncDestination({
                baseUrl: config.controlPlaneSync.baseUrl,
                timeoutMs: config.controlPlaneSync.timeoutMs,
                getServiceToken: async (tenantId, scope) => {
                  const token = await createServiceToken(
                    ctx,
                    tenantId,
                    scope ?? "controlplane:sync",
                  );
                  return token.access_token;
                },
              }),
            ]
          : []),
        // Must come after delivery destinations so the flag only flips when
        // the upstream hook destinations actually succeeded.
        new RegistrationFinalizerDestination(managementAdapter.users),
      ],
    }),
  );

  app.use(async (ctx, next) => {
    // Write routes own their own transactional boundaries (see linkUsersHook,
    // createUserUpdateHooks, createUserDeletionHooks). Holding a transaction
    // across the full request would enclose external I/O — pre-registration
    // webhooks and user-authored action code — which is unsafe on hosted DBs.
    ctx.env.data = applyDecorators(ctx, managementAdapter);
    ctx.env.entityHooks = config.entityHooks;
    await next();
  });

  // Mirror Auth0's `fapi` (failed API operation) log entries: any management
  // API request that ends with a 4xx/5xx response writes a log to the tenant's
  // log stream so callers can see failures alongside successes. Positioned
  // inside the outbox middleware (so background log writes get drained) and
  // outside the auth/tenant middlewares (so we catch their throws and still
  // have tenant_id available from the request header / tenantMiddleware).
  app.use(async (ctx, next) => {
    let thrown: unknown;
    try {
      await next();
    } catch (err) {
      thrown = err;
    }

    let status: number;
    let body: unknown;
    if (thrown instanceof HTTPException) {
      status = thrown.status;
      const res = thrown.getResponse();
      if (res.headers.get("content-type")?.includes("application/json")) {
        try {
          body = await res.clone().json();
        } catch {
          // ignore unparseable body
        }
      }
    } else if (thrown) {
      status = 500;
    } else {
      status = ctx.res.status;
      if (
        status >= 400 &&
        ctx.res.headers.get("content-type")?.includes("application/json")
      ) {
        try {
          body = await ctx.res.clone().json();
        } catch {
          // ignore unparseable body
        }
      }
    }

    if (status >= 400 && status < 600) {
      const tenantId = ctx.var.tenant_id || ctx.req.header("tenant-id");
      if (tenantId && ctx.env.data?.logs) {
        try {
          // Include the presented audience in the description so operators
          // can immediately see which `aud` caused a 403 (and tell apart
          // "Invalid audience" vs missing-scope failures from the request
          // log). Falls through gracefully when no token was attached.
          const tokenAud = ctx.var.user?.aud;
          const audStr = Array.isArray(tokenAud)
            ? tokenAud.join(",")
            : typeof tokenAud === "string"
              ? tokenAud
              : undefined;
          const description = audStr
            ? `${ctx.req.method} ${ctx.req.path} (aud: ${audStr})`
            : `${ctx.req.method} ${ctx.req.path}`;
          await logMessage(ctx, tenantId, {
            type: LogTypes.FAILED_API_OPERATION,
            description,
            response: { statusCode: status, body },
          });
        } catch (err) {
          console.warn("Failed to write fapi log:", err);
        }
      }
    }

    if (thrown) throw thrown;
  });

  app
    .use(clientInfoMiddleware)
    .use(preferMiddleware)
    .use(tenantMiddleware)
    .use(
      createAuthMiddleware(app, {
        requireManagementAudience: true,
        relaxManagementAudience: config.relaxManagementAudience,
        additionalManagementAudiences: config.additionalManagementAudiences,
      }),
    )
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
    .route("/actions/actions", actionsRoutes)
    .route("/actions/executions", actionExecutionsRoutes)
    .route("/actions/triggers", actionTriggersRoutes)
    .route("/branding", brandingRoutes)
    .route("/custom-domains", customDomainRoutes)
    .route("/email/providers", emailProviderRoutes)
    // Auth0's official path is /emails/provider — alias so SDKs work.
    .route("/emails/provider", emailProviderRoutes)
    .route("/email-templates", emailTemplatesRoutes)
    .route("/users", userRoutes)
    .route("/keys", keyRoutes)
    .route("/users-by-email", usersByEmailRoutes)
    .route("/clients", clientRoutes)
    .route("/client-grants", clientGrantRoutes)
    .route("/client-registration-tokens", clientRegistrationTokenRoutes)
    .route("/logs", logRoutes)
    .route("/log-streams", logStreamsRoutes)
    .route("/migration-sources", migrationSourcesRoutes)
    .route("/attack-protection", attackProtectionRoutes)
    .route("/failed-events", failedEventsRoutes)
    .route("/hooks", hooksRoutes)
    .route("/hook-code", hookCodeRoutes)
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
    .route("/analytics", createAnalyticsRoutes({ cache: cacheAdapter }))
    .route("/guardian", guardianRoutes)
    .route("/tickets", ticketsRoutes)
    .route(
      "/users/:user_id/authentication-methods",
      authenticationMethodsRoutes,
    );

  // Only mount core tenant routes if no extension overrides /tenants
  if (!extensionPaths.has("/tenants")) {
    managementApp.route("/tenants", tenantRoutes);
  }

  // Mount proxy-routes management when the data adapter exposes one. The
  // adapter is optional on DataAdapters; without it the routes return 501.
  if (!extensionPaths.has("/proxy-routes") && managementAdapter.proxyRoutes) {
    managementApp.route("/proxy-routes", proxyRoutesRoutes);
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
