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
  // Resolve browser-facing host upfront (before any early returns)
  const xForwardedHost = ctx.req.header("x-forwarded-host");
  const hostHeader = ctx.req.header("host");
  ctx.set(
    "host",
    xForwardedHost || hostHeader || new URL(getIssuer(ctx.env)).host,
  );

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
  if (xForwardedHost) {
    const domain = await ctx.env.data.customDomains.getByDomain(xForwardedHost);
    if (domain) {
      ctx.set("tenant_id", domain.tenant_id);
      ctx.set("custom_domain", xForwardedHost);
      return await next();
    }
  }

  // Check host header for custom domains (when accessed directly, not via proxy)
  if (hostHeader) {
    // First, check if the full host is a registered custom domain
    const customDomain =
      await ctx.env.data.customDomains.getByDomain(hostHeader);
    if (customDomain) {
      ctx.set("tenant_id", customDomain.tenant_id);
      ctx.set("custom_domain", hostHeader);
      return await next();
    }

    // Otherwise, check if the subdomain matches a tenant ID
    const hostParts = hostHeader.split(".");
    if (hostParts.length > 1 && typeof hostParts[0] === "string") {
      const subdomain = hostParts[0];
      // Check if the subdomain exists as a tenant ID
      const tenant = await ctx.env.data.tenants.get(subdomain);
      if (tenant) {
        ctx.set("tenant_id", subdomain);
      }
    }
  }

  // Check query string for tenant_id (used in enrollment ticket URLs)
  if (!ctx.var.tenant_id) {
    const tenantIdQuery = ctx.req.query("tenant_id");
    if (tenantIdQuery) {
      ctx.set("tenant_id", tenantIdQuery);
      return await next();
    }
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
