import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { Bindings, Variables } from "./types";
import createManagementApi from "./management-app";
import createOauthApi from "./auth-app";
import { AuthHeroConfig } from "./types/AuthHeroConfig";
import { addDataHooks } from "./hooks";
import { createX509Certificate } from "./helpers/encryption";

export * from "@authhero/adapter-interfaces";

export function init(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

  app.use(async (ctx, next) => {
    ctx.env.data = addDataHooks(ctx, config.dataAdapter);
    return next();
  });

  app.get("/", (ctx: Context) => {
    return ctx.json({
      name: "authhero",
    });
  });

  const managementApp = createManagementApi();
  app.route("/api/v2", managementApp);

  const oauthApp = createOauthApi();
  app.route("/", oauthApp);

  return {
    app,
    managementApp,
    oauthApp,
    createX509Certificate,
  };
}
