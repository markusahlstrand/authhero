import { OpenAPIHono } from "@hono/zod-openapi";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { composeAuthData } from "../../helpers/compose-auth-data";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { LogStreamDestination } from "../../helpers/outbox-destinations/log-streams";
import { serverTimingMiddleware } from "../../helpers/server-timing";
import { samlpRoutes } from "./samlp";

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
      getDestinations: () => [
        new LogsDestination(config.dataAdapter.logs),
        ...(config.dataAdapter.logStreams
          ? [new LogStreamDestination(config.dataAdapter.logStreams)]
          : []),
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
      // `clients` kept in L2 — see auth-api comment for the pre-prefetch
      // getByClientId rationale.
      nonBundleEntities: ["clients", "forms"],
    });
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
