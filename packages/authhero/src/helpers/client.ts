import { z } from "@hono/zod-openapi";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  Client,
  clientSchema,
  Connection,
  connectionSchema,
  Tenant,
  tenantSchema,
} from "@authhero/adapter-interfaces";
import { Bindings } from "../types";
import { getUniversalLoginUrl } from "../variables";
import { isCimdClientId, resolveCimdClient } from "./cimd";
import { SsrfFetchOptions } from "../utils/ssrf-fetch";

/**
 * EnrichedClient combines a Client with its associated Tenant and Connections.
 *
 * Instead of fetching this combined data through a special adapter,
 * use the getEnrichedClient helper function which fetches the entities
 * separately and composes them.
 */
export const enrichedClientSchema = clientSchema.extend({
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
});

export type EnrichedClient = z.infer<typeof enrichedClientSchema>;

type ClientLike = {
  callbacks?: string[];
  web_origins?: string[];
  allowed_logout_urls?: string[];
  allowed_origins?: string[];
};

function dedupeUrls(a?: string[], b?: string[]): string[] {
  return [...new Set([...(b || []), ...(a || [])])];
}

// Mirrors `mergeClientWithFallback` in @authhero/multi-tenancy. Kept local
// to avoid a circular dep (multi-tenancy already imports from authhero).
function mergeClientUrls<T extends ClientLike>(client: T, cp: ClientLike): T {
  return {
    ...client,
    callbacks: dedupeUrls(client.callbacks, cp.callbacks),
    web_origins: dedupeUrls(client.web_origins, cp.web_origins),
    allowed_logout_urls: dedupeUrls(
      client.allowed_logout_urls,
      cp.allowed_logout_urls,
    ),
    allowed_origins: dedupeUrls(client.allowed_origins, cp.allowed_origins),
  };
}

/**
 * Fetches a client along with its tenant and connections by making separate
 * adapter calls. This composites the data into an EnrichedClient.
 *
 * When tenantId is provided, all fetches happen in parallel for better performance.
 * When tenantId is not provided, we first fetch the client to get the tenant_id,
 * then fetch tenant and connections in parallel.
 *
 * If no connections are explicitly enabled for the client, falls back to all
 * connections available in the tenant.
 *
 * @param env - The environment bindings containing data adapters
 * @param clientId - The client ID to fetch
 * @param tenantId - Optional tenant ID (if known, enables parallel fetching)
 * @returns EnrichedClient with client, tenant, and connections data
 * @throws JSONHTTPException if client or tenant is not found
 */
/**
 * Composes a base Client with its tenant and connections into an EnrichedClient,
 * augmenting the URL lists with the universal-login URLs every auth flow needs.
 */
function enrichClient(
  env: Bindings,
  client: Client,
  tenant: Tenant,
  connections: Connection[],
): EnrichedClient {
  const universalLoginUrl = getUniversalLoginUrl(env);
  return {
    ...client,
    web_origins: [...(client.web_origins || []), `${universalLoginUrl}login`],
    allowed_logout_urls: [...(client.allowed_logout_urls || []), env.ISSUER],
    callbacks: [...(client.callbacks || []), `${universalLoginUrl}info`],
    tenant,
    connections,
  };
}

/**
 * Idempotently insert a minimal `clients` row for a CIMD client so the
 * `refresh_tokens` / `login_sessions` foreign keys to `clients` are satisfied.
 * The row is an FK anchor only — runtime values come from the freshly-fetched
 * metadata document each request. The `client_metadata.cimd: true` marker
 * identifies stub rows for admin tooling and future cleanup.
 */
async function ensureCimdStubClient(
  env: Bindings,
  tenantId: string,
  synthesized: Client,
): Promise<void> {
  const existing = await env.data.clients.get(tenantId, synthesized.client_id);
  if (existing) return;
  try {
    await env.data.clients.create(tenantId, {
      client_id: synthesized.client_id,
      name: synthesized.name,
      app_type: synthesized.app_type,
      is_first_party: false,
      token_endpoint_auth_method: synthesized.token_endpoint_auth_method,
      grant_types: synthesized.grant_types,
      client_metadata: { cimd: "true" },
    });
  } catch {
    // Two concurrent CIMD requests can race the get/create. Either won — the
    // FK anchor exists. Treat any insert error as benign; if it wasn't a
    // duplicate, the FK insert later will surface a clearer error.
  }
}

export async function getEnrichedClient(
  env: Bindings,
  clientId: string,
  tenantId?: string,
  fetchOpts?: SsrfFetchOptions,
): Promise<EnrichedClient> {
  // CIMD: the client_id is an https URL hosting the client metadata document.
  // Requires the tenant to be known (resolved from the request host/domain) and
  // the per-tenant flag to be enabled. The document is fetched and validated on
  // every request — the synthesized client is what callers see. A stub row in
  // `clients` is upserted on first use as an FK anchor for `refresh_tokens` /
  // `login_sessions` (see migration 2025-09-16T12:30:00); runtime values still
  // come from the freshly-fetched document, not the stub.
  if (isCimdClientId(clientId)) {
    if (!tenantId) {
      throw new JSONHTTPException(400, {
        message: "tenant_id is required to resolve a CIMD client",
      });
    }
    const tenant = await env.data.tenants.get(tenantId);
    if (!tenant) {
      throw new JSONHTTPException(404, { message: "Tenant not found" });
    }
    if (tenant.flags?.client_id_metadata_document_registration !== true) {
      throw new JSONHTTPException(403, { message: "Client not found" });
    }
    const synthesized = await resolveCimdClient(clientId, fetchOpts);
    const allConnections = await env.data.connections.list(tenantId);
    await ensureCimdStubClient(env, tenantId, synthesized);
    return enrichClient(env, synthesized, tenant, allConnections.connections);
  }

  // If we don't have tenant_id, fetch the client first to get it
  let client;
  let resolvedTenantId = tenantId;

  if (!resolvedTenantId) {
    const clientWithTenant = await env.data.clients.getByClientId(clientId);
    if (!clientWithTenant) {
      throw new JSONHTTPException(403, { message: "Client not found" });
    }
    const { tenant_id, ...clientData } = clientWithTenant;
    client = clientData;
    resolvedTenantId = tenant_id;
  }

  // Resolve control-plane fallback config so we can fetch the control plane
  // client in parallel with the rest. The URL merge has to happen here (not
  // in the adapter wrapper) so storage reads from the management API and DCR
  // don't see — and then write back — inherited callbacks.
  //
  // If `resolveControlPlane` is configured, it takes precedence over the
  // static IDs: tenants the resolver returns `undefined` for opt out of URL
  // inheritance entirely, and the resolver may point different tenants at
  // different control planes.
  const fallbackConfig = env.data.multiTenancyConfig;
  let controlPlaneTenantId = fallbackConfig?.controlPlaneTenantId;
  let controlPlaneClientId = fallbackConfig?.controlPlaneClientId;
  if (fallbackConfig?.resolveControlPlane) {
    const resolved = await fallbackConfig.resolveControlPlane({
      tenant_id: resolvedTenantId,
    });
    controlPlaneTenantId = resolved?.tenantId;
    controlPlaneClientId = resolved?.clientId ?? controlPlaneClientId;
  }
  const shouldFetchControlPlaneClient =
    !!controlPlaneTenantId &&
    !!controlPlaneClientId &&
    !(
      resolvedTenantId === controlPlaneTenantId &&
      clientId === controlPlaneClientId
    );

  // Fetch all data in parallel, including fallback connections
  const [fetchedClient, tenant, clientConnections, allConnections, cpClient] =
    await Promise.all([
      client
        ? Promise.resolve(client)
        : env.data.clients.get(resolvedTenantId, clientId),
      env.data.tenants.get(resolvedTenantId),
      env.data.clientConnections.listByClient(resolvedTenantId, clientId),
      env.data.connections.list(resolvedTenantId),
      shouldFetchControlPlaneClient
        ? env.data.clients.get(controlPlaneTenantId!, controlPlaneClientId!)
        : Promise.resolve(null),
    ]);

  const baseClient = client || fetchedClient;
  if (!baseClient) {
    throw new JSONHTTPException(403, { message: "Client not found" });
  }
  const finalClient = cpClient
    ? mergeClientUrls(baseClient, cpClient)
    : baseClient;
  // Treat soft-deleted clients (DCR DELETE /oidc/register/:id) as if they
  // were removed entirely — no token issuance, no /authorize, no resume.
  if (finalClient.client_metadata?.status === "deleted") {
    throw new JSONHTTPException(403, { message: "Client not found" });
  }
  if (!tenant) {
    throw new JSONHTTPException(404, { message: "Tenant not found" });
  }

  // If no connections explicitly enabled for this client, fall back to all tenant connections
  const connections =
    clientConnections.length > 0
      ? clientConnections
      : allConnections.connections || [];

  return enrichClient(env, finalClient, tenant, connections);
}
