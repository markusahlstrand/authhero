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

  // Hosts on the canonical ISSUER apex are tenant subdomains, never custom
  // domains — skip the customDomains probe for them to avoid a DB round-trip
  // on every request to e.g. tenant.auth.example.com.
  const issuerHost = new URL(getIssuer(ctx.env)).host.toLowerCase();
  const isIssuerHost = (host: string) =>
    host === issuerHost || host.endsWith(`.${issuerHost}`);

  // Check x-forwarded-host for custom domains (used for proxied requests).
  // Per RFC 3986 §3.2.2 the host component is case-insensitive — normalize
  // before lookups but preserve the original casing in ctx.var.host /
  // custom_domain so we don't mutate values used in URL string comparisons.
  if (xForwardedHost) {
    const lowerForwarded = xForwardedHost.toLowerCase();
    if (!isIssuerHost(lowerForwarded)) {
      const domain =
        await ctx.env.data.customDomains.getByDomain(lowerForwarded);
      if (domain) {
        ctx.set("tenant_id", domain.tenant_id);
        ctx.set("custom_domain", xForwardedHost);
        return await next();
      }
    }
  }

  // Check host header for custom domains (when accessed directly, not via proxy)
  if (hostHeader) {
    const lowerHost = hostHeader.toLowerCase();

    // First, check if the full host is a registered custom domain
    if (!isIssuerHost(lowerHost)) {
      const customDomain =
        await ctx.env.data.customDomains.getByDomain(lowerHost);
      if (customDomain) {
        ctx.set("tenant_id", customDomain.tenant_id);
        ctx.set("custom_domain", hostHeader);
        return await next();
      }
    }

    // Otherwise, check if the subdomain matches a tenant ID
    const hostParts = lowerHost.split(".");
    if (hostParts.length > 1 && typeof hostParts[0] === "string") {
      const subdomain = hostParts[0];
      // Check if the subdomain exists as a tenant ID
      const tenant = await ctx.env.data.tenants.get(subdomain);
      if (tenant) {
        ctx.set("tenant_id", subdomain);
        // When the request lands on a tenant subdomain (not the canonical
        // ISSUER host), use that host for self-referencing URLs so the iss
        // claim and openid-configuration match the host the client called.
        // Host comparison is case-insensitive, but preserve the request's
        // original casing in custom_domain.
        if (lowerHost !== issuerHost) {
          ctx.set("custom_domain", hostHeader);
        }
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
