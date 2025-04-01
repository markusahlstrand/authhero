import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";

/**
 * Sets the tenant id in the context based on the url and headers
 * @param ctx
 * @param next
 * @returns
 */
export async function tenantMiddleware(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  // Check x-forwarded-host for custom domains (used for proxied requests)
  const xForwardedHost = ctx.req.header("x-forwarded-host");
  if (xForwardedHost) {
    const domain = await ctx.env.data.customDomains.getByDomain(xForwardedHost);
    if (domain) {
      ctx.set("tenant_id", domain.tenant_id);
      return await next();
    }
  }

  // Check host header for subdomain matching tenant ID (direct requests)
  const host = ctx.req.header("host");
  if (host) {
    const hostParts = host.split(".");
    if (hostParts.length > 1 && typeof hostParts[0] === "string") {
      const subdomain = hostParts[0];
      // Check if the subdomain exists as a tenant ID
      const tenant = await ctx.env.data.tenants.get(subdomain);
      if (tenant) {
        ctx.set("tenant_id", subdomain);
      }
    }
  }

  return await next();
}
