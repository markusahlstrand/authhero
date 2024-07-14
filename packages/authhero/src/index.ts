import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { Bindings, Variables } from "./types";
import { wellKnownRoutes } from "./routes/oauth2";

export interface AuthHeroConfig {}

export function init() {
  const rootApp = new OpenAPIHono<{ Bindings: Bindings }>();

  rootApp.get("/", (ctx: Context) => {
    return ctx.text("Hello, authhero!");
  });

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

  return rootApp;
}
