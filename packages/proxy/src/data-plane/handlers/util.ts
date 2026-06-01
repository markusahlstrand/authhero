import type { Context } from "hono";

const PROXY_REQ_KEY = "__authhero_proxy_request__";
const PROXY_TENANT_ID_KEY = "__authhero_proxy_tenant_id__";
const PROXY_CUSTOM_DOMAIN_ID_KEY = "__authhero_proxy_custom_domain_id__";
const PROXY_DOMAIN_KEY = "__authhero_proxy_domain__";
const MUTABILITY_PROBE = "x-authhero-proxy-mutability-probe";

export function setProxyRequest(c: Context, req: Request): void {
  c.set(PROXY_REQ_KEY as never, req);
}

export function getProxyRequest(c: Context): Request {
  const stashed = c.get(PROXY_REQ_KEY as never) as Request | undefined;
  return stashed ?? c.req.raw;
}

export interface ProxyHostContext {
  tenant_id: string;
  custom_domain_id: string;
  domain: string;
}

export function setProxyHostContext(c: Context, ctx: ProxyHostContext): void {
  c.set(PROXY_TENANT_ID_KEY as never, ctx.tenant_id);
  c.set(PROXY_CUSTOM_DOMAIN_ID_KEY as never, ctx.custom_domain_id);
  c.set(PROXY_DOMAIN_KEY as never, ctx.domain);
}

export function getProxyTenantId(c: Context): string | undefined {
  return c.get(PROXY_TENANT_ID_KEY as never) as string | undefined;
}

export function getProxyCustomDomainId(c: Context): string | undefined {
  return c.get(PROXY_CUSTOM_DOMAIN_ID_KEY as never) as string | undefined;
}

export function getProxyDomain(c: Context): string | undefined {
  return c.get(PROXY_DOMAIN_KEY as never) as string | undefined;
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

// Cloudflare Workers (and Miniflare) hand back `Response` objects from
// `fetch()` whose headers are immutable — any `set`/`append`/`delete` throws
// `TypeError: Can't modify immutable headers.` Response-phase handlers that
// rewrite headers after `await next()` must call this first to swap `c.res`
// for a copy whose headers we own. Hono's own `c.res =` setter merges the
// previous response's headers into the replacement (it reads the old headers,
// which is allowed, and writes to the new ones), so the swap is value-safe.
export function ensureMutableResponseHeaders(c: Context): void {
  const current = c.res;
  try {
    current.headers.append(MUTABILITY_PROBE, "1");
    current.headers.delete(MUTABILITY_PROBE);
    return;
  } catch {
    c.res = new Response(current.body, {
      status: current.status,
      statusText: current.statusText,
      headers: new Headers(current.headers),
    });
  }
}
