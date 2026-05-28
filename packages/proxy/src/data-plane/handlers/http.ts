import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { getProxyRequest } from "./util";

const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;

const optionsSchema = z.object({
  upstream_url: z.string(),
  preserve_host: z.boolean().default(false),
  timeout_ms: z.number().int().positive().optional(),
});

type Options = z.infer<typeof optionsSchema>;

function combinePaths(base: string, request: string): string {
  if (base === "" || base === "/") return request;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedReq = request.startsWith("/") ? request : `/${request}`;
  return `${trimmedBase}${trimmedReq}`;
}

function bodyAllowed(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export function buildUpstreamRequest(
  options: Options,
  req: Request,
): { target: URL; init: RequestInit } {
  const inUrl = new URL(req.url);
  const target = new URL(options.upstream_url);

  target.pathname = combinePaths(target.pathname, inUrl.pathname);
  target.search = inUrl.search;

  const headers = new Headers(req.headers);
  for (const key of HOP_HEADERS) headers.delete(key);

  if (!options.preserve_host) {
    headers.set("host", target.host);
  }
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", inUrl.host);
  }
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", inUrl.protocol.replace(":", ""));
  }

  const body = bodyAllowed(req.method) ? req.body : undefined;
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  };
  // Node/undici require `duplex: "half"` whenever a streamed request body is
  // forwarded to fetch; without it the call throws before the request is sent.
  if (body instanceof ReadableStream) {
    init.duplex = "half";
  }
  return { target, init };
}

export const httpHandler = defineHandler<Options>({
  type: "http",
  optionsSchema,
  build(options) {
    const timeoutMs = options.timeout_ms ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
    return async (c) => {
      const req = getProxyRequest(c);
      const { target, init } = buildUpstreamRequest(options, req);

      // Stash upstream context for downstream rewrite handlers run on the
      // response phase of earlier middleware in the chain. Use `hostname`
      // (no port) so `rewrite_cookies` can match it against the `Domain=`
      // attribute, which never includes a port.
      c.set("__proxy_upstream_host__" as never, target.hostname);
      c.set(
        "__proxy_upstream_origin__" as never,
        `${target.protocol}//${target.host}`,
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(target.toString(), {
          ...init,
          signal: controller.signal,
        });
        // Some runtimes hand back a Response whose body is locked to the
        // original socket; Hono only sets `c.res = …` via assignment, which
        // is fine. Returning the Response directly also works.
        return res;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return new Response("Upstream timeout", { status: 504 });
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };
  },
});
