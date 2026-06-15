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
import { composeAuthData } from "../../helpers/compose-auth-data";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { serverTimingMiddleware } from "../../helpers/server-timing";
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
  app.use(serverTimingMiddleware);

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
    const cacheAdapter =
      config.dataAdapter.cache ||
      createInMemoryCache({
        defaultTtlSeconds: 0,
        maxEntries: 100,
        cleanupIntervalMs: 0,
      });

    ctx.env.data = composeAuthData({
      ctx,
      rawData: config.dataAdapter,
      cacheAdapter,
      defaultTtl: config.dataAdapter.cache ? 300 : 0,
      // Bundle-covered entities (tenants/connections/clientConnections/
      // branding/resourceServers/promptSettings/themes/hooks) are cached at
      // L0 and intentionally NOT listed here — composeAuthData puts them in
      // L1 dedup automatically.
      //
      // `clients` is the one exception: prefetchClientBundle calls
      // clients.getByClientId(cid) BEFORE ctx.var.client_id is set, so the
      // wrapper can't route it to the bundle.
      nonBundleEntities: [
        "clients",
        "customDomains",
        "forms",
        "roles",
        "organizations",
        "userRoles",
        "userPermissions",
        "keys",
      ],
    });
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
