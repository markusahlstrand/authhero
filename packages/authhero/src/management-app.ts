import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "./types";
import { brandingRoutes } from "./routes/management-api/branding";
// import { domainRoutes } from "./routes/management-api/domains";
import { userRoutes } from "./routes/management-api/users";
import { keyRoutes } from "./routes/management-api/keys";
import { usersByEmailRoutes } from "./routes/management-api/users-by-email";
import { clientRoutes } from "./routes/management-api/clients";
import { tenantRoutes } from "./routes/management-api/tenants";
import { logRoutes } from "./routes/management-api/logs";
import { hooksRoutes } from "./routes/management-api/hooks";
import { connectionRoutes } from "./routes/management-api/connections";
import { promptsRoutes } from "./routes/management-api/prompts";
import { registerComponent } from "./middlewares/register-component";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createAuthMiddleware } from "./middlewares/authentication";
import { emailProviderRoutes } from "./routes/management-api/emails";

export interface CreateAuthParams {
  dataAdapter: DataAdapters;
}

export default function create() {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app.use(createAuthMiddleware(app));

  const managementApp = app
    .route("/branding", brandingRoutes)
    // .route("/domains", domainRoutes)
    .route("/email/providers", emailProviderRoutes)
    .route("/users", userRoutes)
    .route("/keys", keyRoutes)
    .route("/users-by-email", usersByEmailRoutes)
    .route("/clients", clientRoutes)
    .route("/tenants", tenantRoutes)
    .route("/logs", logRoutes)
    .route("/hooks", hooksRoutes)
    .route("/connections", connectionRoutes)
    .route("/prompts", promptsRoutes);

  registerComponent(managementApp);

  managementApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Management api",
    },
  });

  return managementApp;
}
