import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { identifierRoutes } from "./identifier";
import { enterCodeRoutes } from "./enter-code";
import { enterPasswordRoutes } from "./enter-password";
import { signupRoutes } from "./signup";
import { resetPasswordRoutes } from "./reset-password";
import { forgotPasswordRoutes } from "./forgot-password";
import { checkAccountRoutes } from "./check-account";
import { accountRoutes } from "./account";
import { changeEmailRoutes } from "./change-email";
import { changeEmailConfirmationRoutes } from "./change-email-confirmation";
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
import { tailwindCss } from "../../styles";
import { formNodeRoutes } from "./form-node";
import { RedirectException } from "../../errors/redirect-exception";
import { HTTPException } from "hono/http-exception";

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

  // As we want to be able to redirect on errors, we need to handle all errors explicitly
  app.onError((err, c) => {
    if (err instanceof RedirectException) {
      return c.redirect(err.location, err.status);
    }

    // Optionally handle other error types
    if (err instanceof HTTPException) {
      return c.text(err.message || "Error", err.status);
    }

    return c.text("Unexpected error", 500);
  });

  // Handle CSS route separately to avoid unnecessary middleware
  app.get("/css/tailwind.css", async (ctx: Context) => {
    const css = tailwindCss;

    return ctx.text(css, 200, {
      "content-type": "text/css; charset=utf-8",
    });
  });

  app
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
          "branding",
          "themes",
          "promptSettings",
          "forms",
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
    .route("/change-email", changeEmailRoutes)
    .route("/change-email-confirmation", changeEmailConfirmationRoutes)
    .route("/login/identifier", identifierRoutes)
    .route("/enter-code", enterCodeRoutes)
    .route("/enter-password", enterPasswordRoutes)
    .route("/invalid-session", invalidSessionRoutes)
    .route("/pre-signup", preSignupRoutes)
    .route("/pre-signup-sent", preSignupSentRoutes)
    .route("/reset-password", resetPasswordRoutes)
    .route("/forgot-password", forgotPasswordRoutes)
    .route("/validate-email", validateEmailRoutes)
    .route("/signup", signupRoutes)
    .route("/forms", formNodeRoutes);

  universalApp.doc("/u/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Universal login",
    },
  });

  return universalApp;
}
