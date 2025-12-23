import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";

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
        name: "AuthHero Multi-Tenant Server",
        version: "1.0.0",
        status: "running",
        docs: "/docs",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
