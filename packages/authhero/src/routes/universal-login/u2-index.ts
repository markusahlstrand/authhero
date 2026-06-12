/**
 * U2 Universal Login - Client-side widget routes
 *
 * This module creates the u2 app which provides a client-side widget-based
 * universal login experience. It's meant to run in parallel with /u/ routes
 * and will eventually replace them.
 *
 * Routes:
 * - /u2/screen/:screenId - Screen API (GET/POST)
 * - /u2/login/identifier - Identifier screen
 * - /u2/login/email-otp-challenge - Email OTP code verification
 * - /u2/login/sms-otp-challenge - SMS OTP code verification
 * - /u2/enter-password - Password authentication
 * - /u2/signup - New user registration
 * - /u2/reset-password/request - Password reset request
 * - /u2/reset-password - Set new password
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { composeAuthData } from "../../helpers/compose-auth-data";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { LogStreamDestination } from "../../helpers/outbox-destinations/log-streams";
import { WebhookDestination } from "../../helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../helpers/outbox-destinations/registration-finalizer";
import { createServiceToken } from "../../helpers/service-token";
import { screenApiRoutes } from "./screen-api";
import { u2Routes } from "./u2-routes.tsx";
import { u2FormNodeRoutes } from "./u2-form-node.tsx";
import { createUniversalLoginErrorHandler } from "./error-handler";

export default function createU2App(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  const defaultTtl = config.dataAdapter.cache ? 300 : 0;

  // Render a branded error page for all errors (except redirects)
  app.onError(createUniversalLoginErrorHandler());

  // CORS middleware for screen API - allow requests from any origin
  app.use(
    "/screen/*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Tenant-Id"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );

  // Data adapter middleware
  app
    .use(applyConfigMiddleware(config))
    .use(
      outboxMiddleware({
        getOutbox: () => config.dataAdapter.outbox,
        getDestinations: (ctx) => [
          new LogsDestination(config.dataAdapter.logs),
          ...(config.dataAdapter.logStreams
            ? [new LogStreamDestination(config.dataAdapter.logStreams)]
            : []),
          new WebhookDestination(config.dataAdapter.hooks, async (tenantId) => {
            const token = await createServiceToken(ctx, tenantId, "webhook");
            return token.access_token;
          }),
          new RegistrationFinalizerDestination(config.dataAdapter.users),
        ],
      }),
    )
    .use(async (ctx, next) => {
      // Per-request fallback cache so request-scoped state never leaks across
      // u2 requests. A configured persistent cache is shared intentionally;
      // only the in-memory fallback is per-request. Mirrors the auth-api
      // middleware.
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
        defaultTtl,
        // `clients` kept in L2 — see auth-api comment for the pre-prefetch
        // getByClientId rationale.
        nonBundleEntities: [
          "clients",
          "customDomains",
          "roles",
          "organizations",
          "forms",
          "customText",
          "universalLoginTemplates",
        ],
      });
      return next();
    })
    .use(clientInfoMiddleware)
    .use(tenantMiddleware);

  // Mount routes
  const u2App = app
    .route("/screen", screenApiRoutes)
    .route("/forms", u2FormNodeRoutes)
    .route("/", u2Routes);

  // OpenAPI spec
  u2App.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "U2 Universal Login (Client-side Widget)",
    },
  });

  return u2App;
}

// Re-export the individual route modules for flexibility
export { screenApiRoutes } from "./screen-api";
export { u2Routes } from "./u2-routes.tsx";
export { u2FormNodeRoutes } from "./u2-form-node.tsx";
