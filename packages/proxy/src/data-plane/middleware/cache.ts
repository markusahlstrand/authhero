import { MiddlewareConfig } from "../../types";

type CacheConfig = Extract<MiddlewareConfig, { type: "cache" }>;

export function applyCacheHeaders(
  config: CacheConfig,
  res: Response,
): Response {
  const headers = new Headers(res.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", `public, max-age=${config.ttl_seconds}`);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
