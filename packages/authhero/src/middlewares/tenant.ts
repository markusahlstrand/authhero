import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { getIssuer } from "../variables";

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
  const user = ctx.var.user;
  if (user?.tenant_id) {
    ctx.set("tenant_id", user.tenant_id);
    return await next();
  }

  // Check tenant-id header first (for API calls)
  const tenantIdHeader = ctx.req.header("tenant-id");
  if (tenantIdHeader) {
    ctx.set("tenant_id", tenantIdHeader);
    return await next();
  }

  // Check x-forwarded-host for custom domains (used for proxied requests)
  const xForwardedHost = ctx.req.header("x-forwarded-host");
  if (xForwardedHost) {
    const domain = await ctx.env.data.customDomains.getByDomain(xForwardedHost);
    if (domain) {
      ctx.set("tenant_id", domain.tenant_id);
      ctx.set("custom_domain", xForwardedHost);
      ctx.set("host", xForwardedHost);
      return await next();
    }
  }

  // Check host header for subdomain matching tenant ID (direct requests)
  const host = ctx.req.header("host");
  if (host) {
    ctx.set("host", host);
    const hostParts = host.split(".");
    if (hostParts.length > 1 && typeof hostParts[0] === "string") {
      const subdomain = hostParts[0];
      // Check if the subdomain exists as a tenant ID
      const tenant = await ctx.env.data.tenants.get(subdomain);
      if (tenant) {
        ctx.set("tenant_id", subdomain);
      }
    }
  } else {
    ctx.set("host", new URL(getIssuer(ctx.env)).host);
  }

  // Auto-detect single tenant: if no tenant found and only one exists in DB, use it
  if (!ctx.var.tenant_id) {
    const { tenants } = await ctx.env.data.tenants.list({ per_page: 2 });
    if (tenants.length === 1 && tenants[0]) {
      ctx.set("tenant_id", tenants[0].id);
    }
  }

  return await next();
}
