import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { callbackRoutes, loginCallbackRoutes } from "./callback";
import { logoutRoutes } from "./logout";
import { oidcLogoutRoutes } from "./oidc-logout";
import { userinfoRoutes } from "./userinfo";
import { wellKnownRoutes } from "./well-known";
import { tokenRoutes } from "./token";
import { revokeRoutes } from "./revoke";
import { dbConnectionRoutes } from "./dbconnections";
import { passwordlessRoutes } from "./passwordless";
import { authenticateRoutes } from "./authenticate";
import { authorizeRoutes } from "./authorize";
import { accountRoutes } from "./account";
import { registerRoutes } from "./register";
import { connectStartRoutes } from "./connect-start";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper";
import { addRequestScopedDedup } from "../../helpers/request-scoped-dedup";
import { withClientBundle } from "../../helpers/with-client-bundle";
import { addBundleWritePurge } from "../../helpers/bundle-write-purge";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { LogStreamDestination } from "../../helpers/outbox-destinations/log-streams";
import { WebhookDestination } from "../../helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../helpers/outbox-destinations/registration-finalizer";
import { makeOutboxServiceTokenFactory } from "../../helpers/service-token";
import { getIssuer } from "../../variables";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app.use(applyConfigMiddleware(config));

  app.use(
    outboxMiddleware({
      getOutbox: () => config.dataAdapter.outbox,
      getDestinations: (ctx) => [
        new LogsDestination(config.dataAdapter.logs),
        ...(config.dataAdapter.logStreams
          ? [new LogStreamDestination(config.dataAdapter.logStreams)]
          : []),
        new WebhookDestination(
          config.dataAdapter.hooks,
          makeOutboxServiceTokenFactory({
            tenants: ctx.env.data.tenants,
            keys: ctx.env.data.keys,
            issuer: getIssuer(ctx.env, ctx.var.custom_domain),
          }),
          { webhookInvoker: ctx.env.webhookInvoker },
        ),
        // Must come after delivery destinations so the flag only flips when
        // the upstream hook destinations actually succeeded.
        new RegistrationFinalizerDestination(config.dataAdapter.users),
      ],
    }),
  );

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

    // Stable config entities — safe to both cache cross-request and dedup
    // within a request. Anything that mutates transactionally (sessions,
    // codes, loginSessions, users, refreshTokens, clientGrants, logs, …) is
    // omitted on purpose; see request-scoped-dedup.ts for the rationale.
    const stableEntities = [
      "tenants",
      "connections",
      "clientConnections",
      "customDomains",
      "clients",
      "branding",
      "themes",
      "promptSettings",
      "forms",
      "resourceServers",
      "roles",
      "organizations",
      "userRoles",
      "userPermissions",
      "hooks",
      "keys",
    ];

    // L2: persistent cross-request cache (CF Cache API in prod) for any
    // read-only entity. Catches the long tail outside the bundle.
    const cachedData = addCaching(dataWithHooks, {
      defaultTtl,
      cacheEntities: stableEntities,
      cache: cacheAdapter,
    });

    // L1: per-request in-flight Promise dedup so two callers asking for the
    // same key share one round-trip even when they hit different code paths.
    const dedupedData = addRequestScopedDedup(cachedData, {
      dedupEntities: stableEntities,
    });

    // Purge the bundle cache when writes hit bundle-covered entities so a
    // local edge sees its own writes immediately. Sits between L0 and L1 so
    // it runs after the write succeeds at L2.
    const purgingData = addBundleWritePurge(dedupedData, cacheAdapter);

    // L0: per-(tenant, client) bundle, SWR 5min fresh / 10min stale. Routes
    // bundle-covered methods (tenant/client/connections/branding/etc.) to a
    // single cache key. Other reads pass through to L1.
    const bundledData = withClientBundle(ctx, purgingData, cacheAdapter);

    // Finally wrap with timing logs
    ctx.env.data = addTimingLogs(ctx, bundledData);
    return next();
  });

  const oauthCors = cors({
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
  });
  app.use("/oauth/token", oauthCors);
  app.use("/oauth/revoke", oauthCors);

  app
    .use(clientInfoMiddleware)
    .use(tenantMiddleware)
    .use(createAuthMiddleware(app));

  const oauthApp = app
    .route("/v2/logout", logoutRoutes)
    .route("/oidc/logout", oidcLogoutRoutes)
    .route("/userinfo", userinfoRoutes)
    .route("/.well-known", wellKnownRoutes)
    .route("/oauth/token", tokenRoutes)
    .route("/oauth/revoke", revokeRoutes)
    .route("/dbconnections", dbConnectionRoutes)
    .route("/passwordless", passwordlessRoutes)
    .route("/co/authenticate", authenticateRoutes)
    .route("/authorize", authorizeRoutes)
    .route("/account", accountRoutes)
    .route("/oidc/register", registerRoutes)
    .route("/connect/start", connectStartRoutes)
    .route("/callback", callbackRoutes)
    .route("/login/callback", loginCallbackRoutes);

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
