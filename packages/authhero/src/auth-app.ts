import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "./types";
import { registerComponent } from "./middlewares/register-component";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createAuthMiddleware } from "./middlewares/authentication";
import {
  logoutRoutes,
  tokenRoutes,
  wellKnownRoutes,
  userinfoRoutes,
  dbConnectionRoutes,
  passwordlessRoutes,
  authenticateRoutes,
  authorizeRoutes,
} from "./routes/auth-api";

export interface CreateAuthParams {
  dataAdapter: DataAdapters;
}

export default function create() {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app.use(createAuthMiddleware(app));

  const oauthApp = app
    .route("/v2/logout", logoutRoutes)
    .route("/userinfo", userinfoRoutes)
    .route("/.well-known", wellKnownRoutes)
    .route("/oauth/token", tokenRoutes)
    .route("/dbconnections", dbConnectionRoutes)
    .route("/passwordless", passwordlessRoutes)
    .route("/co/authenticate", authenticateRoutes)
    .route("/authorize", authorizeRoutes);

  oauthApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Oauth API",
    },
  });

  registerComponent(oauthApp);

  return oauthApp;
}
