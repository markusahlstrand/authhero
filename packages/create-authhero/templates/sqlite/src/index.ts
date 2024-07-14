import { Hono } from "hono";
import { init } from "authhero";

// function init() {
//   const app = new OpenAPIHono<{ Bindings: Bindings }>();

//   app.get("/test", (ctx: Context) => {
//     return ctx.text("Hello, world!");
//   });

//   return app;
// }

const app = new Hono();
app.get("/", (c) => c.text("Hono!"));
const authhero = init();

app.route("/", authhero);
export default app;
