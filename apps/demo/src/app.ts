import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DataAdapters, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import packageJson from "../package.json";

export default function create(dataAdapter: DataAdapters) {
  const { app } = init({
    dataAdapter,
  });

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

  return app;
}
