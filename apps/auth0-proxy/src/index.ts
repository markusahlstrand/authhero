import { Hono, Context } from "hono";
import { cors } from "hono/cors";
import { env } from "hono/adapter";
import { version } from "../package.json";

const app = new Hono();
const EXCLUDE_HEADERS = ["host", "content-encoding", "x-auth0-domain"];

app.get("/", async (c: Context) => {
  return c.json({
    name: "Auth0 Proxy",
    version,
  });
});

// Apply CORS middleware to both API and OAuth endpoints
const corsMiddleware = cors({
  origin: [
    "https://manage.authhe.ro",
    "https://local.authhe.ro",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  allowHeaders: ["Content-Type", "Authorization", "x-auth0-domain"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  exposeHeaders: ["Content-Length", "X-Requested-With"],
  maxAge: 86400,
  credentials: true,
});

app.use("/api/*", corsMiddleware);
app.use("/oauth/*", corsMiddleware);

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

// Special handler for OAuth token endpoint that doesn't require additional auth
app.post("/oauth/token", async (c) => {
  const envVars = env<{ AUTH0_DOMAIN?: string }>(c);
  const auth0Domain = envVars.AUTH0_DOMAIN || c.req.header("x-auth0-domain");

  if (!auth0Domain) {
    return c.json(
      {
        error:
          "Missing Auth0 domain. Set AUTH0_DOMAIN env variable or provide x-auth0-domain header.",
      },
      400,
    );
  }

  // Ensure the domain has a protocol prefix
  let domainWithProtocol = auth0Domain;
  if (
    !domainWithProtocol.startsWith("http://") &&
    !domainWithProtocol.startsWith("https://")
  ) {
    domainWithProtocol = `https://${domainWithProtocol}`;
  }

  // Validate the domain format
  try {
    new URL(domainWithProtocol);
  } catch (error) {
    return c.json({ error: "Invalid Auth0 domain URL format" }, 400);
  }

  // Create the target URL for the token endpoint
  const targetUrl = new URL(`${domainWithProtocol}/oauth/token`);

  // Pass through the request without requiring additional auth
  const headers = new Headers();
  c.req.raw.headers.forEach((value, key) => {
    if (!EXCLUDE_HEADERS.includes(key)) {
      headers.set(key, value);
    }
  });

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers,
      body: c.req.raw.body,
    });

    const text = await response.text();
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!EXCLUDE_HEADERS.includes(key)) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(text, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch token from Auth0" }, 500);
  }
});

app.all("*", async (c) => {
  /**
   * Prioritize environment variables over request headers:
   * 1. For Auth0 domain: Use AUTH0_DOMAIN env first, then fall back to x-auth0-domain header
   * 2. For authorization: Use API_KEY env first, then fall back to authorization header
   *
   * This makes the environment the source of truth, with headers as optional overrides.
   */
  const envVars = env<{ AUTH0_DOMAIN?: string }>(c);
  const auth0Domain = envVars.AUTH0_DOMAIN || c.req.header("x-auth0-domain");

  if (!auth0Domain) {
    return c.json(
      {
        error:
          "Missing Auth0 domain. Set AUTH0_DOMAIN env variable or provide x-auth0-domain header.",
      },
      400,
    );
  }

  // Ensure the domain has a protocol prefix
  let domainWithProtocol = auth0Domain;
  if (
    !domainWithProtocol.startsWith("http://") &&
    !domainWithProtocol.startsWith("https://")
  ) {
    domainWithProtocol = `https://${domainWithProtocol}`;
  }

  // Validate the domain format
  try {
    new URL(domainWithProtocol);
  } catch (error) {
    return c.json({ error: "Invalid Auth0 domain URL format" }, 400);
  }

  const sourceUrl = new URL(c.req.url);
  const targetUrl = new URL(domainWithProtocol);
  targetUrl.pathname = sourceUrl.pathname;
  targetUrl.search = sourceUrl.search;

  const headers = new Headers();
  c.req.raw.headers.forEach((value, key) => {
    if (!EXCLUDE_HEADERS.includes(key)) {
      headers.set(key, value);
    }
  });

  // Get authorization from environment variables first, then fall back to headers
  const { API_KEY = "", API_KEY2 = "" } = env<{
    API_KEY?: string;
    API_KEY2?: string;
  }>(c);

  if (API_KEY) {
    // If API_KEY exists, use it
    headers.set("Authorization", `Bearer ${API_KEY + API_KEY2}`);
  } else {
    // Fall back to authorization header
    const authHeader = c.req.header("authorization");
    if (authHeader) {
      headers.set("Authorization", authHeader);
    } else {
      return c.json(
        {
          error:
            "Missing authorization. Set API_KEY env variable or provide authorization header.",
        },
        400,
      );
    }
  }

  const response = await fetch(targetUrl.toString(), {
    method: c.req.method,
    headers,
    body: c.req.raw.body,
  });

  const text = await response.text();

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!EXCLUDE_HEADERS.includes(key)) {
      responseHeaders.set(key, value);
    }
  });

  responseHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(text, {
    status: response.status,
    headers: responseHeaders,
  });
});

export default app;
