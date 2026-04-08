import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { identifierRoutes } from "./identifier";
import { enterCodeRoutes } from "./otp-challenge";
import { enterPasswordRoutes } from "./enter-password";
import { signupRoutes } from "./signup";
import { resetPasswordRoutes } from "./reset-password";
import { forgotPasswordRoutes } from "./forgot-password";
import { checkAccountRoutes } from "./check-account";
import { accountRoutes } from "./account";
import { accountChangeEmailRoutes } from "./account-change-email";
import { changeEmailVerifyRoutes } from "./account-change-email-verify";
import { changeEmailConfirmationRoutes } from "./account-change-email-confirmation";
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { preSignupRoutes } from "./pre-signup";
import { invalidSessionRoutes } from "./invalid-session";
import { infoRoutes } from "./info";
import { validateEmailRoutes } from "./validate-email";
import { preSignupSentRoutes } from "./pre-signup-sent";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { tailwindCss } from "../../styles";
import { clientJs } from "../../client/client-bundle";
import { formNodeRoutes } from "./form-node";
import { impersonateRoutes } from "./impersonate";
import { continueRoutes } from "./continue";
import { errorRoutes } from "./error";
import { createUniversalLoginErrorHandler } from "./error-handler";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  // Set up cache once at app creation time
  const cacheAdapter =
    config.dataAdapter.cache ||
    createInMemoryCache({
      defaultTtlSeconds: 0, // No TTL for request-scoped cache
      maxEntries: 100, // Smaller limit since it's per-request
      cleanupIntervalMs: 0, // Disable cleanup since cache dies with the request
    });

  // TTL strategy: if using provided cache adapter, use longer TTL; if request-scoped, use 0
  const defaultTtl = config.dataAdapter.cache ? 300 : 0; // 5 minutes for persistent, 0 for request-scoped

  // Render a branded error page for all errors (except redirects)
  app.onError(createUniversalLoginErrorHandler());

  // Handle CSS route separately to avoid unnecessary middleware
  app.get("/css/tailwind.css", async (ctx: Context) => {
    const css = tailwindCss;

    return ctx.text(css, 200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  // Handle client-side JavaScript bundle
  app.get("/js/client.js", async (ctx: Context) => {
    return ctx.text(clientJs, 200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  // Widget static file serving
  // If widgetHandler is provided in config, use it to serve widget files
  // Otherwise, return a helpful 404 error explaining how to configure it
  if (config.widgetHandler) {
    app.get("/widget/*", config.widgetHandler);
  } else {
    app.get("/widget/*", async (ctx: Context) => {
      return ctx.json(
        {
          error: "widget_not_configured",
          message:
            "The AuthHero widget is not configured. Provide a widgetHandler in your AuthHeroConfig to serve widget files from @authhero/widget package.",
        },
        404,
      );
    });
  }

  app
    .use(
      outboxMiddleware({
        getOutbox: () => config.dataAdapter.outbox,
        getDestinations: () => [new LogsDestination(config.dataAdapter.logs)],
      }),
    )
    .use(async (ctx, next) => {
      // First add data hooks
      const dataWithHooks = addDataHooks(ctx, config.dataAdapter);

      // Use the app-level cache adapter
      const cachedData = addCaching(dataWithHooks, {
        defaultTtl,
        cacheEntities: [
          "tenants",
          "connections",
          "clients",
          "clientConnections",
          "customDomains",
          "resourceServers",
          "roles",
          "organizations",
          "branding",
          "themes",
          "promptSettings",
          "forms",
          "hooks",
        ],
        cache: cacheAdapter,
      });

      // Finally wrap with timing logs
      ctx.env.data = addTimingLogs(ctx, cachedData);
      return next();
    })
    .use(clientInfoMiddleware)
    .use(tenantMiddleware);

  const universalApp = app
    .route("/info", infoRoutes)
    .route("/check-account", checkAccountRoutes)
    .route("/account", accountRoutes)
    .route("/account/change-email", accountChangeEmailRoutes)
    .route("/account/change-email-verify", changeEmailVerifyRoutes)
    .route("/account/change-email-confirmation", changeEmailConfirmationRoutes)
    .route("/login/identifier", identifierRoutes)
    .route("/login/email-otp-challenge", enterCodeRoutes)
    .route("/login/sms-otp-challenge", enterCodeRoutes)
    .route("/enter-password", enterPasswordRoutes)
    .route("/invalid-session", invalidSessionRoutes)
    .route("/pre-signup", preSignupRoutes)
    .route("/pre-signup-sent", preSignupSentRoutes)
    .route("/reset-password", resetPasswordRoutes)
    .route("/forgot-password", forgotPasswordRoutes)
    .route("/validate-email", validateEmailRoutes)
    .route("/signup", signupRoutes)
    .route("/impersonate", impersonateRoutes)
    .route("/forms", formNodeRoutes)
    .route("/continue", continueRoutes)
    .route("/error", errorRoutes);

  universalApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Universal login",
    },
  });

  return universalApp;
}
