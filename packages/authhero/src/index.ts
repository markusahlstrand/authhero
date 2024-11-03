import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { Bindings, Variables } from "./types";
import { wellKnownRoutes } from "./routes/oauth2";
import createManagementApi from "./management-app";
import { DataAdapters } from "@authhero/adapter-interfaces";

export interface AuthHeroConfig {
  dataAdapter: DataAdapters;
}

export function init(options: AuthHeroConfig) {
  const rootApp = new OpenAPIHono<{ Bindings: Bindings }>();

  rootApp.get("/", (ctx: Context) => {
    return ctx.text("Hello, authhero!");
  });

  const managementApp = createManagementApi(options);
  rootApp.route("/api/v2", managementApp);

  /**
   * The oauth routes
   */
  const oauthApp = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>().route("/.well-known", wellKnownRoutes);

  oauthApp.doc("/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Oauth endpoints",
    },
  });

  rootApp.route("/", oauthApp);

  return {
    rootApp,
    managementApp,
    oauthApp,
  };
}
