import { Context } from "hono";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve absolute paths to avoid issues with different working directories
const widgetPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/widget/dist/authhero-widget",
);

export default function createApp(config: AuthHeroConfig) {
  // Configure widget handler before init() to serve widget files at /u/widget/*
  const configWithWidget: AuthHeroConfig = {
    ...config,
    widgetHandler: serveStatic({
      root: widgetPath,
      rewriteRequestPath: (p) => p.replace("/u/widget", ""),
    }),
  };

  const { app } = init(configWithWidget);

  app
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Server",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
