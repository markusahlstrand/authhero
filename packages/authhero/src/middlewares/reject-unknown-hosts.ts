import { Context, MiddlewareHandler } from "hono";
import { Bindings, Variables } from "../types";
import { getIssuer } from "../variables";

/**
 * True when the request host belongs to this deployment: the ISSUER host, a
 * `{tenant}.{issuer}` subdomain of an existing tenant, or a registered custom
 * domain.
 *
 * Only the effective host is checked — `x-forwarded-host` when a proxy set
 * it, else `host` — the same one tenantMiddleware and the discovery handlers
 * build URLs from. Accepting either header would let an unregistered public
 * alias through whenever the proxy's backend `host` is a known one.
 */
async function isKnownHost(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<boolean> {
  const effectiveHost = (
    ctx.req.header("x-forwarded-host") ?? ctx.req.header("host")
  )?.toLowerCase();
  if (!effectiveHost) return false;

  // tenantMiddleware has usually settled this already, but it probes both
  // headers for custom domains (so `custom_domain` can be the backend host)
  // and returns early for authenticated users and `tenant-id` headers.
  if (ctx.var.custom_domain?.toLowerCase() === effectiveHost) return true;

  const issuerHost = new URL(getIssuer(ctx.env)).host.toLowerCase();
  if (effectiveHost === issuerHost) return true;
  if (effectiveHost.endsWith(`.${issuerHost}`)) {
    const label = effectiveHost.slice(0, -(issuerHost.length + 1));
    return !label.includes(".") && !!(await ctx.env.data.tenants.get(label));
  }
  return !!(await ctx.env.data.customDomains.getByDomain(effectiveHost));
}

/**
 * Opt-in (`init({ rejectUnknownHosts: true })`). Without it, discovery and
 * JWKS on a host this deployment doesn't own fall back to the control-plane
 * keys and apex metadata, so anyone could point a domain at the worker and
 * serve AuthHero discovery from it. Mounted on every `/.well-known/*` route,
 * including the MCP protected-resource metadata.
 */
export const rejectUnknownHostsMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (ctx, next) => {
  if (ctx.env.rejectUnknownHosts && !(await isKnownHost(ctx))) {
    return ctx.text("Not Found", 404);
  }
  return next();
};
