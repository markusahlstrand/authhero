import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthHeroConfig, init } from "authhero";
import { AuthHeroPlugin } from "@authhero/multi-tenancy";
import { swaggerUI } from "@hono/swagger-ui";

export default function createApp(
  config: AuthHeroConfig,
  multiTenancyPlugin: AuthHeroPlugin,
) {
  const { app } = init(config);

  // Apply multi-tenancy middleware
  if (multiTenancyPlugin.middleware) {
    app.use("*", multiTenancyPlugin.middleware);
  }

  // Mount multi-tenancy routes
  if (multiTenancyPlugin.routes) {
    for (const route of multiTenancyPlugin.routes) {
      app.route(route.path, route.handler);
    }
  }

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
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  // Call onRegister if defined
  if (multiTenancyPlugin.onRegister) {
    multiTenancyPlugin.onRegister(app);
  }

  return app;
}
