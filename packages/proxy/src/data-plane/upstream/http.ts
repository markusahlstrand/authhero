import { ProxyRoute } from "../../types";

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

export async function dispatchHttp(
  route: ProxyRoute,
  req: Request,
  upstreamTimeoutMs: number = DEFAULT_UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  const inUrl = new URL(req.url);
  const target = new URL(route.upstream_url);

  target.pathname = combinePaths(target.pathname, inUrl.pathname);
  target.search = inUrl.search;

  const headers = new Headers(req.headers);
  for (const key of HOP_HEADERS) headers.delete(key);

  if (!route.preserve_host) {
    headers.set("host", target.host);
  }
  appendForwardedFor(headers, req);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    return await fetch(target.toString(), {
      method: req.method,
      headers,
      body: bodyAllowed(req.method) ? req.body : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response("Upstream timeout", { status: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function combinePaths(base: string, request: string): string {
  if (base === "" || base === "/") return request;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedReq = request.startsWith("/") ? request : `/${request}`;
  return `${trimmedBase}${trimmedReq}`;
}

function bodyAllowed(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function appendForwardedFor(headers: Headers, req: Request): void {
  const inUrl = new URL(req.url);
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", inUrl.host);
  }
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", inUrl.protocol.replace(":", ""));
  }
}
