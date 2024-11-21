import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { Bindings, Variables } from "./types";
import { wellKnownRoutes } from "./routes/oauth2";
import createManagementApi from "./management-app";
import { AuthHeroConfig } from "./types/AuthHeroConfig";

export * from "@authhero/adapter-interfaces";

export function init(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{ Bindings: Bindings }>();

  app.get("/", (ctx: Context) => {
    return ctx.json({
      name: "authhero",
    });
  });

  const managementApp = createManagementApi(config);
  app.route("/api/v2", managementApp);

  /**
   * The oauth routes
   */
  const oauthApp = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>().route("/.well-known", wellKnownRoutes());

  oauthApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Oauth endpoints",
    },
  });

  app.route("/", oauthApp);

  return {
    app,
    managementApp,
    oauthApp,
  };
}
