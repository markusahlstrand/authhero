import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables, AuthHeroConfig } from "../../types";
import { brandingRoutes } from "./branding";
import { userRoutes } from "./users";
import { keyRoutes } from "./keys";
import { usersByEmailRoutes } from "./users-by-email";
import { clientRoutes } from "./clients";
import { tenantRoutes } from "./tenants";
import { logRoutes } from "./logs";
import { hooksRoutes } from "./hooks";
import { connectionRoutes } from "./connections";
import { promptsRoutes } from "./prompts";
import { registerComponent } from "../../middlewares/register-component";
import { createAuthMiddleware } from "../../middlewares/authentication";
import { emailProviderRoutes } from "./emails";
import { sessionsRoutes } from "./sessions";
import { refreshTokensRoutes } from "./refresh_tokens";
import { customDomainRoutes } from "./custom-domains";
import { addDataHooks } from "../../hooks";
import { tenantMiddleware } from "../../middlewares/tenant";

export default function create(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  registerComponent(app);

  app.use(async (ctx, next) => {
    ctx.env.data = addDataHooks(ctx, config.dataAdapter);
    return next();
  });

  app.use(tenantMiddleware).use(createAuthMiddleware(app));

  const managementApp = app
    .route("/branding", brandingRoutes)
    .route("/custom-domains", customDomainRoutes)
    .route("/email/providers", emailProviderRoutes)
    .route("/users", userRoutes)
    .route("/keys", keyRoutes)
    .route("/users-by-email", usersByEmailRoutes)
    .route("/clients", clientRoutes)
    .route("/tenants", tenantRoutes)
    .route("/logs", logRoutes)
    .route("/hooks", hooksRoutes)
    .route("/connections", connectionRoutes)
    .route("/prompts", promptsRoutes)
    .route("/sessions", sessionsRoutes)
    .route("/refresh_tokens", refreshTokensRoutes);

  managementApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Management api",
    },
    security: [
      {
        oauth2: ["openid", "email", "profile"],
      },
    ],
  });

  return managementApp;
}
