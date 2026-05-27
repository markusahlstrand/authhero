import { MiddlewareConfig } from "../../types";

export function applyCorsRequest(
  config: Extract<MiddlewareConfig, { type: "cors" }>,
  req: Request,
): Response | null {
  if (req.method !== "OPTIONS") return null;

  const headers = buildCorsHeaders(config, req);
  return new Response(null, { status: 204, headers });
}

export function applyCorsResponse(
  config: Extract<MiddlewareConfig, { type: "cors" }>,
  req: Request,
  res: Response,
): Response {
  const headers = new Headers(res.headers);
  const corsHeaders = buildCorsHeaders(config, req);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function buildCorsHeaders(
  config: Extract<MiddlewareConfig, { type: "cors" }>,
  req: Request,
): Headers {
  const headers = new Headers();
  const origin = req.headers.get("origin");
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
    headers.set("Access-Control-Expose-Headers", config.expose_headers.join(", "));
  }
  if (config.max_age !== undefined) {
    headers.set("Access-Control-Max-Age", String(config.max_age));
  }
  return headers;
}
