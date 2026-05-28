import type { Context } from "hono";

const PROXY_REQ_KEY = "__authhero_proxy_request__";

export function setProxyRequest(c: Context, req: Request): void {
  c.set(PROXY_REQ_KEY as never, req);
}

export function getProxyRequest(c: Context): Request {
  const stashed = c.get(PROXY_REQ_KEY as never) as Request | undefined;
  return stashed ?? c.req.raw;
}

export function mutateRequestHeaders(
  c: Context,
  fn: (headers: Headers) => void,
): void {
  const current = getProxyRequest(c);
  const headers = new Headers(current.headers);
  fn(headers);
  setProxyRequest(c, new Request(current, { headers }));
}
