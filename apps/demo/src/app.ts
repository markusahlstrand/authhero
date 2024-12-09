import { Context } from "hono";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { DataAdapters, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import {
  createAuthMiddleware,
  registerComponent,
} from "hono-openapi-middlewares";
import packageJson from "../package.json";
import { Bindings } from "./types/Bindings";

export default function create(dataAdapter: DataAdapters) {
  const app = new OpenAPIHono<{ Bindings: Bindings }>();

  app
    .onError((err, ctx) => {
      if (err instanceof HTTPException) {
        // Get the custom response
        return err.getResponse();
      }

      return ctx.text(err.message, 500);
    })
    .get("/", async (ctx: Context) => {
      const url = new URL(ctx.req.url);
      const tenantId = url.hostname.split(".")[0];
      return ctx.json({
        name: tenantId,
        version: packageJson.version,
      });
    })
    .get("/docs", swaggerUI({ url: "/spec" }));
  app.use(createAuthMiddleware(app));
  app.use(registerComponent(app));

  const { managementApp, oauthApp } = init({
    dataAdapter,
  });

  managementApp.doc("/spec", (c) => ({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Management API",
    },
    servers: [
      {
        url: new URL(c.req.url).origin,
        description: "Current environment",
      },
    ],
  }));

  app.route("/api/v2", managementApp);
  app.route("/", oauthApp);

  return app;
}
