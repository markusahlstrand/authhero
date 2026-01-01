import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "hono/bun";
import packageJson from "../package.json";
import { demoPages } from "./demo-pages";

export default function create(config: AuthHeroConfig) {
  const { app } = init(config);

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
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Serve widget files from the @authhero/widget package at /u/widget/
    // This is required for the flow-widget routes to work
    .get(
      "/u/widget/*",
      serveStatic({
        root: "./node_modules/@authhero/widget/dist/authhero-widget",
        rewriteRequestPath: (path) => path.replace("/u/widget", ""),
      }),
    )
    // Also serve at /widget/ for demo pages that use /widget/ path
    .get(
      "/widget/*",
      serveStatic({
        root: "./node_modules/@authhero/widget/dist/authhero-widget",
        rewriteRequestPath: (path) => path.replace("/widget", ""),
      }),
    )
    // Demo pages for testing widget integration patterns
    .route("/demo", demoPages);

  return app;
}
