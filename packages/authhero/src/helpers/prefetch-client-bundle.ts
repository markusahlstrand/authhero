import { Context } from "hono";
import { Client, Tenant } from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Bindings, Variables } from "../types";

/**
 * Explicit prefetch for the per-(tenant_id, client_id) bundle.
 *
 * Called once at the top of a route handler. Discovers tenant_id from
 * client_id (if not provided), populates `ctx.var.{client_id, tenant_id}`,
 * and warms the bundle so every downstream bundle-covered read in this
 * request is served from one cache key.
 *
 * Why explicit instead of relying on the wrapper alone: the wrapper hooks
 * via ctx.var, but several helpers (e.g. getEnrichedClient) need to read
 * config BEFORE the route has resolved client_id/tenant_id. With this
 * prefetch you set those upfront, so all the subsequent reads — including
 * the ones inside getEnrichedClient's Promise.all — engage the bundle.
 *
 * Throws 403 if the client_id can't be resolved, 404 if its tenant is
 * missing — matching the contract of getEnrichedClient. Does NOT handle
 * CIMD clients (URL-based client_ids); callers that may receive a CIMD
 * client_id should continue to use {@link getEnrichedClient} which has
 * the CIMD-specific resolution path.
 */
export async function prefetchClientBundle(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  opts: { client_id: string; tenant_id?: string },
): Promise<{ tenant: Tenant; client: Client }> {
  const { client_id } = opts;
  // Prefer an explicit tenant_id, then the tenant the request already resolved
  // (host subdomain / custom domain / tenant-id header). Falling back to the
  // global getByClientId discovery only when the request carries no tenant is
  // what preserves tenant isolation: without this, a request to one tenant's
  // host could authenticate a client_id that belongs to a different tenant,
  // because the global lookup derives — and then overwrites ctx with — the
  // client's own tenant. See getEnrichedClient for the same precedence.
  let tenant_id = opts.tenant_id ?? ctx.var.tenant_id;

  // Discover tenant_id only when the request resolved none. This is the one
  // call that can't be bundle-served because ctx.var.client_id isn't set yet.
  if (!tenant_id) {
    const result = await ctx.env.data.clients.getByClientId(client_id);
    if (!result) {
      throw new JSONHTTPException(403, { message: "Client not found" });
    }
    tenant_id = result.tenant_id;
  }

  // Set ctx vars so the bundle wrapper engages for every subsequent read in
  // this request (including the ones inside getEnrichedClient's Promise.all).
  // Setting them up front (rather than after validation) is what lets the
  // Promise.all below be served from a single bundle key instead of two raw
  // reads. Capture the previous values so we can restore them if validation
  // fails — callers that swallow the throw (`.catch(() => {})`) must not be
  // left with ctx scoped to a tenant/client that didn't validate.
  const prevTenantId = ctx.var.tenant_id;
  const prevClientId = ctx.var.client_id;
  ctx.set("tenant_id", tenant_id);
  ctx.set("client_id", client_id);

  try {
    // Trigger the bundle load. Two reads kicked off in parallel — both hit
    // the wrapper, share one bundle-fetch Promise, and return from the
    // bundle. No extra round-trips.
    const [tenant, client] = await Promise.all([
      ctx.env.data.tenants.get(tenant_id),
      ctx.env.data.clients.get(tenant_id, client_id),
    ]);

    if (!tenant) {
      throw new JSONHTTPException(404, { message: "Tenant not found" });
    }
    if (!client) {
      throw new JSONHTTPException(403, { message: "Client not found" });
    }

    return { tenant, client };
  } catch (err) {
    ctx.set("tenant_id", prevTenantId);
    ctx.set("client_id", prevClientId);
    throw err;
  }
}
