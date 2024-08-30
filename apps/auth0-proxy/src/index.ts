import { Hono, Context } from "hono";
import { cors } from "hono/cors";
import { env } from "hono/adapter";

const app = new Hono();
const EXCLUDE_HEADERS = ["host", "content-encoding"];

app.get("/", async (c: Context) => {
  c.text("Auth0 Proxy");
});

app.use("/api/*", cors());

app.get("/api/v2/tenants", async (ctx: Context) => {
  // This enptoint does't exist on Auth0 as they only hanle one tenant per subdomain.
  return ctx.json({
    tenants: [
      {
        id: "proxy",
        name: "Proxy Tenant",
        audience: "",
        sender_email: "",
        sender_name: "",
        created_at: "",
        updated_at: "",
        support_url: "",
      },
    ],
    start: 0,
    limit: 10,
    length: 1,
  });
});

app.all("*", async (c) => {
  const {
    AUTH0_DOMAIN,
    API_KEY,
    API_KEY2 = "",
  } = env<{
    AUTH0_DOMAIN: string;
    API_KEY: string;
    API_KEY2: string;
  }>(c);

  const targetUrl = new URL(AUTH0_DOMAIN);
  targetUrl.pathname = c.req.path;

  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (EXCLUDE_HEADERS.includes(key)) {
      continue;
    }
    headers.set(key, value);
  }
  headers.set("Authorization", `Bearer ${API_KEY + API_KEY2}`);

  const response = await fetch(targetUrl.toString(), {
    method: c.req.method,
    headers,
    body: c.req.raw.body,
  });

  const text = await response.text();

  const responseHeaders = new Headers();
  for (const [key, value] of response.headers.entries()) {
    if (EXCLUDE_HEADERS.includes(key)) {
      continue;
    }
    responseHeaders.set(key, value);
  }

  responseHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(text, {
    status: response.status,
    headers: responseHeaders,
  });
});

export default app;
