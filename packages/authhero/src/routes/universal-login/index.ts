import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { identifierRoutes } from "./identifier";
import { enterCodeRoutes } from "./otp-challenge";
import { enterPasswordRoutes } from "./enter-password";
import { signupRoutes } from "./signup";
import { resetPasswordRoutes } from "./reset-password";
import { forgotPasswordRoutes } from "./forgot-password";
import { accountRoutes } from "./account";
import { accountChangeEmailRoutes } from "./account-change-email";
import { changeEmailVerifyRoutes } from "./account-change-email-verify";
import { changeEmailConfirmationRoutes } from "./account-change-email-confirmation";
import { composeAuthData } from "../../helpers/compose-auth-data";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { serverTimingMiddleware } from "../../helpers/server-timing";
import { preSignupRoutes } from "./pre-signup";
import { invalidSessionRoutes } from "./invalid-session";
import { infoRoutes } from "./info";
import { validateEmailRoutes } from "./validate-email";
import { preSignupSentRoutes } from "./pre-signup-sent";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { LogStreamDestination } from "../../helpers/outbox-destinations/log-streams";
import { WebhookDestination } from "../../helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../helpers/outbox-destinations/registration-finalizer";
import { createServiceToken } from "../../helpers/service-token";
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
    .use(applyConfigMiddleware(config))
    .use(serverTimingMiddleware)
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
      // Create the fallback cache per-request so request-scoped state never
      // leaks across universal-login requests. A configured persistent cache
      // is shared intentionally; only the in-memory fallback is per-request.
      // Mirrors the auth-api middleware.
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

  const universalApp = app
    .route("/info", infoRoutes)
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
