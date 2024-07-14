import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings } from "./types/Bindings";
import { Context } from "hono";
import { init } from "./";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const authhero = init();

app.get("/test", (ctx: Context) => {
  return ctx.text("Hello, world!");
});

app.route("/", authhero);

export default app;
