import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";

export default function createApp(config: AuthHeroConfig) {
  const { app } = init(config);

  app
    .onError((err, ctx) => {
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      console.error(err);
      return ctx.text(err.message, 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Server",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Serve widget assets from @authhero/widget package
    .get(
      "/u/widget/*",
      serveStatic({
        root: "./node_modules/@authhero/widget/dist/authhero-widget",
        rewriteRequestPath: (path) => path.replace("/u/widget", ""),
      }),
    )
    // Serve static assets (CSS, JS) from authhero package
    .get(
      "/u/*",
      serveStatic({
        root: "./node_modules/authhero/dist/assets/u",
        rewriteRequestPath: (path) => path.replace("/u", ""),
      }),
    );

  return app;
}
