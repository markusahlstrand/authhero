import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";

const optionsSchema = z
  .object({
    origins: z.array(z.string()).optional(),
    allow_credentials: z.boolean().optional(),
    allow_headers: z.array(z.string()).optional(),
    allow_methods: z.array(z.string()).optional(),
    expose_headers: z.array(z.string()).optional(),
    max_age: z.number().int().optional(),
  })
  .refine(
    (data) => !(data.allow_credentials && data.origins?.includes("*")),
    { message: "Cannot use wildcard origin (*) with allow_credentials" },
  );

type Options = z.infer<typeof optionsSchema>;

function buildCorsHeaders(config: Options, origin: string | null): Headers {
  const headers = new Headers();
  const allowedOrigins = config.origins ?? ["*"];
  const wildcard = allowedOrigins.includes("*");

  if (wildcard && !config.allow_credentials) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && (wildcard || allowedOrigins.includes(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.append("Vary", "Origin");
  }

  if (config.allow_credentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  if (config.allow_methods?.length) {
    headers.set("Access-Control-Allow-Methods", config.allow_methods.join(", "));
  }
  if (config.allow_headers?.length) {
    headers.set("Access-Control-Allow-Headers", config.allow_headers.join(", "));
  }
  if (config.expose_headers?.length) {
    headers.set(
      "Access-Control-Expose-Headers",
      config.expose_headers.join(", "),
    );
  }
  if (config.max_age !== undefined) {
    headers.set("Access-Control-Max-Age", String(config.max_age));
  }
  return headers;
}

export const corsHandler = defineHandler<Options>({
  type: "cors",
  optionsSchema,
  build(options) {
    return async (c, next) => {
      const origin = c.req.header("origin") ?? null;

      // Only intercept real CORS preflight requests (must include both Origin
      // and Access-Control-Request-Method) — non-CORS OPTIONS calls should
      // fall through so the upstream can serve them.
      const isPreflight =
        c.req.method === "OPTIONS" &&
        origin !== null &&
        c.req.header("access-control-request-method") !== undefined;

      if (isPreflight) {
        const headers = buildCorsHeaders(options, origin);
        return new Response(null, { status: 204, headers });
      }

      await next();

      // Mutate headers in place — Hono's c.res setter merges old headers
      // over new ones, which would clobber any reassignment.
      const corsHeaders = buildCorsHeaders(options, origin);
      corsHeaders.forEach((value, key) => {
        if (key.toLowerCase() === "vary") c.res.headers.append(key, value);
        else c.res.headers.set(key, value);
      });
    };
  },
});
