import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { enterEmailRoutes } from "./enter-email";
import { enterCodeRoutes } from "./enter-code";
import { enterPasswordRoutes } from "./enter-password";
import { signupRoutes } from "./signup";
import { resetPasswordRoutes } from "./reset-password";
import { forgotPasswordRoutes } from "./forgot-password";
import { checkAccountRoutes } from "./check-account";
import { addDataHooks } from "../../hooks";
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

  app.use(tenantMiddleware).use(async (ctx, next) => {
    ctx.env.data = addDataHooks(ctx, config.dataAdapter);
    return next();
  });

  app.get("/css/tailwind.css", async (ctx: Context) => {
    const css = tailwindCss;

    return ctx.text(css, 200, {
      "content-type": "text/css; charset=utf-8",
    });
  });

  const universalApp = app
    .route("/info", infoRoutes)
    .route("/check-account", checkAccountRoutes)
    .route("/enter-email", enterEmailRoutes)
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
