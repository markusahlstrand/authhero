import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { Bindings } from "./types/Bindings";

export interface AuthHeroConfig {}

export function init() {
  const app = new OpenAPIHono<{ Bindings: Bindings }>();

  app.get("/test", (ctx: Context) => {
    return ctx.text("Hello, world!");
  });
}
