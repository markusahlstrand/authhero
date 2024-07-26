import { Context } from "hono";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import packageJson from "../package.json";
import authhero from "authhero";

export default function create() {
  const rootApp = new OpenAPIHono();

  rootApp
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
    });

  const { app } = authhero.init({});

  return {
    app,
  };
}
