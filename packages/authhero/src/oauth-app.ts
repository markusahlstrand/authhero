import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "./types";
import { registerComponent } from "./middlewares/register-component";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createAuthMiddleware } from "./middlewares/authentication";
import { tokenRoutes, wellKnownRoutes } from "./routes/oauth2";

export interface CreateAuthParams {
  dataAdapter: DataAdapters;
}

export default function create() {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  app.use(createAuthMiddleware(app));

  const oauthApp = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>()
    .route("/.well-known", wellKnownRoutes)
    .route("/oauth/token", tokenRoutes);

  oauthApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Oauth endpoints",
    },
  });

  registerComponent(oauthApp);

  oauthApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Management api",
    },
  });

  return oauthApp;
}
