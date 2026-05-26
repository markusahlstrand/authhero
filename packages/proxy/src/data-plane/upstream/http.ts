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

export async function dispatchHttp(
  route: ProxyRoute,
  req: Request,
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

  return fetch(target.toString(), {
    method: req.method,
    headers,
    body: bodyAllowed(req.method) ? req.body : undefined,
    redirect: "manual",
  });
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
