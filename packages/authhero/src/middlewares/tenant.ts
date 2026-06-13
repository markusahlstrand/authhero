import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { getIssuer } from "../variables";
import { isCimdClientId } from "../helpers/cimd";

/**
 * Routes that resolve their tenant from a state artifact (oauth2_state code →
 * login session → client) rather than from the host. For these the
 * single-tenant auto-detect fallback is pure cost — the flow works without a
 * host-derived tenant — so the middleware skips the tenants.list round-trip.
 */
const STATE_KEYED_PATHS = new Set([
  "/callback",
  "/login/callback",
  "/authorize/resume",
]);

/**
 * True when the route resolves its tenant from a request artifact and the
 * single-tenant auto-detect would be pure cost: state-keyed routes (above),
 * and /authorize with a registered client_id (tenant comes from the client
 * lookup). CIMD client_ids (https URLs) are excluded — they have no clients
 * row and rely on the host-derived tenant.
 */
function resolvesTenantWithoutHost(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): boolean {
  if (STATE_KEYED_PATHS.has(ctx.req.path)) return true;
  if (ctx.req.path === "/authorize") {
    const clientId = ctx.req.query("client_id");
    if (clientId && !isCimdClientId(clientId)) return true;
  }
  return false;
}

/**
 * Sets the tenant id in the context based on the url and headers.
 *
 * Resolution order:
 * 1. Authenticated user's tenant
 * 2. `tenant-id` header (API calls)
 * 3. Tenant subdomain of the ISSUER apex — `{tenant_id}.{issuerHost}` carries
 *    the tenant id in the host itself, zero lookups
 * 4. Custom domain lookup (hosts outside the ISSUER apex)
 * 5. `tenant_id` query param (enrollment ticket URLs)
 * 6. Single-tenant auto-detect (skipped for state-keyed routes and for
 *    /authorize with a registered client_id)
 */
export async function tenantMiddleware(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  // Resolve browser-facing host upfront (before any early returns)
  const xForwardedHost = ctx.req.header("x-forwarded-host");
  const hostHeader = ctx.req.header("host");
  const browserHost =
    xForwardedHost || hostHeader || new URL(getIssuer(ctx.env)).host;
  ctx.set("host", browserHost);

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

  const issuerHost = new URL(getIssuer(ctx.env)).host.toLowerCase();
  const isIssuerScoped = (host: string) =>
    host === issuerHost || host.endsWith(`.${issuerHost}`);

  // Tenant-subdomain fast path: hosts of the form `{tenant_id}.{issuerHost}`
  // carry the tenant id in the host itself — no lookup needed. The id is
  // trusted as-is: the first tenant-scoped read (e.g. the client-bundle
  // prefetch) 404s unknown tenants, and setTenantId throws on any mismatch
  // with a state-derived tenant, so deferring validation is safe. Only hosts
  // scoped under the operator's own ISSUER apex get this treatment — for any
  // other host the first label says nothing about tenant identity.
  //
  // Per RFC 3986 §3.2.2 the host is case-insensitive — compare lowercased,
  // but preserve the request's casing in ctx.var.host / custom_domain.
  const lowerBrowserHost = browserHost.toLowerCase();
  if (lowerBrowserHost.endsWith(`.${issuerHost}`)) {
    const label = lowerBrowserHost.slice(0, -(issuerHost.length + 1));
    if (label && !label.includes(".")) {
      ctx.set("tenant_id", label);
      // Self-referencing URLs (iss claim, openid-configuration) should use
      // the subdomain host the client called, not the canonical apex.
      ctx.set("custom_domain", browserHost);
      return await next();
    }
    // Deeper subdomains of the issuer apex are structurally never custom
    // domains either — fall through without probing customDomains.
  }

  // Custom domain lookup for hosts outside the ISSUER apex. Check
  // x-forwarded-host (proxied requests) before the host header (direct).
  for (const candidate of [xForwardedHost, hostHeader]) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    // Hosts on the canonical ISSUER apex are tenant subdomains, never custom
    // domains — skip the probe for them to avoid a DB round-trip on every
    // request to e.g. tenant.auth.example.com.
    if (isIssuerScoped(lower)) continue;
    const domain = await ctx.env.data.customDomains.getByDomain(lower);
    if (domain) {
      ctx.set("tenant_id", domain.tenant_id);
      ctx.set("custom_domain", candidate);
      return await next();
    }
  }

  // Check query string for tenant_id (used in enrollment ticket URLs)
  const tenantIdQuery = ctx.req.query("tenant_id");
  if (tenantIdQuery) {
    ctx.set("tenant_id", tenantIdQuery);
    return await next();
  }

  // Auto-detect single tenant: if no tenant found and only one exists in DB,
  // use it. Skipped for routes that resolve the tenant from a request
  // artifact (state code or client_id) — the tenants.list round-trip is
  // wasted there.
  if (!resolvesTenantWithoutHost(ctx)) {
    const { tenants } = await ctx.env.data.tenants.list({ per_page: 2 });
    if (tenants.length === 1 && tenants[0]) {
      ctx.set("tenant_id", tenants[0].id);
    }
  }

  return await next();
}
