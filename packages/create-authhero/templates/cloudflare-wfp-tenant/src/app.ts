import { Context } from "hono";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";

// A WFP tenant Worker serves a single tenant; its defaults are inherited from
// the control plane via the rows projected into its own database (see
// src/index.ts). No multi-tenancy routing is needed here.
export default function createApp(config: AuthHeroConfig) {
  const { app } = init(config);

  app
    .onError((err, ctx) => {
      // Duck-typing avoids instanceof issues with bundled dependencies.
      if (
        err &&
        typeof err === "object" &&
        "getResponse" in err &&
        typeof (err as { getResponse?: unknown }).getResponse === "function"
      ) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(
        err instanceof Error ? err.message : "Internal Server Error",
        500,
      );
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero WFP Tenant Server",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
