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
 * - /u2/enter-code - OTP code verification
 * - /u2/enter-password - Password authentication
 * - /u2/signup - New user registration
 * - /u2/forgot-password - Password reset request
 * - /u2/reset-password - Set new password
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { screenApiRoutes } from "./screen-api";
import { u2Routes } from "./u2-routes.tsx";
import { checkAccountRoutes } from "./check-account";
import { RedirectException } from "../../errors/redirect-exception";
import { HTTPException } from "hono/http-exception";

export default function createU2App(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  // Set up cache once at app creation time
  const cacheAdapter =
    config.dataAdapter.cache ||
    createInMemoryCache({
      defaultTtlSeconds: 0,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });

  const defaultTtl = config.dataAdapter.cache ? 300 : 0;

  // Error handling
  app.onError((err, c) => {
    if (err instanceof RedirectException) {
      return c.redirect(err.location, err.status);
    }
    if (err instanceof HTTPException) {
      return c.text(err.message || "Error", err.status);
    }
    return c.text("Unexpected error", 500);
  });

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
    .use(async (ctx, next) => {
      const dataWithHooks = addDataHooks(ctx, config.dataAdapter);
      const cachedData = addCaching(dataWithHooks, {
        defaultTtl,
        cacheEntities: [
          "tenants",
          "connections",
          "clients",
          "customDomains",
          "resourceServers",
          "roles",
          "organizations",
          "branding",
          "themes",
          "promptSettings",
          "forms",
        ],
        cache: cacheAdapter,
      });
      ctx.env.data = addTimingLogs(ctx, cachedData);
      return next();
    })
    .use(clientInfoMiddleware)
    .use(tenantMiddleware);

  // Mount routes
  const u2App = app
    .route("/screen", screenApiRoutes)
    .route("/check-account", checkAccountRoutes)
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
