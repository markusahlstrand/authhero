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
import { addDataHooks } from "../../hooks";
import { addTimingLogs } from "../../helpers/server-timing";
import { addCaching } from "../../helpers/cache-wrapper";
import { preSignupRoutes } from "./pre-signup";
import { invalidSessionRoutes } from "./invalid-session";
import { infoRoutes } from "./info";
import { validateEmailRoutes } from "./validate-email";
import { preSignupSentRoutes } from "./pre-signup-sent";
import { tenantMiddleware } from "../../middlewares/tenant";
import { tailwindCss } from "../../styles";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app
    .use(async (ctx, next) => {
      // First add data hooks
      const dataWithHooks = addDataHooks(ctx, config.dataAdapter);
      // Then wrap with caching
      const cachedData = addCaching(dataWithHooks, {
        defaultTtl: 300000, // 5 minutes default TTL
        cacheEntities: ["tenants", "connections", "clients"],
      });
      // Finally wrap with timing logs
      ctx.env.data = addTimingLogs(ctx, cachedData);
      return next();
    })
    .use(tenantMiddleware);

  app.get("/css/tailwind.css", async (ctx: Context) => {
    const css = tailwindCss;

    return ctx.text(css, 200, {
      "content-type": "text/css; charset=utf-8",
    });
  });

  const universalApp = app
    .route("/info", infoRoutes)
    .route("/check-account", checkAccountRoutes)
    .route("/login/identifier", identifierRoutes)
    .route("/enter-code", enterCodeRoutes)
    .route("/enter-password", enterPasswordRoutes)
    .route("/invalid-session", invalidSessionRoutes)
    .route("/pre-signup", preSignupRoutes)
    .route("/pre-signup-sent", preSignupSentRoutes)
    .route("/reset-password", resetPasswordRoutes)
    .route("/forgot-password", forgotPasswordRoutes)
    .route("/validate-email", validateEmailRoutes)
    .route("/signup", signupRoutes);

  universalApp.doc("/u/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Universal login",
    },
  });

  return universalApp;
}
