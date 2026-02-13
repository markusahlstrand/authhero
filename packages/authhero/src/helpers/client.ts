import { z } from "@hono/zod-openapi";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  clientSchema,
  connectionSchema,
  tenantSchema,
} from "@authhero/adapter-interfaces";
import { Bindings } from "../types";
import { getUniversalLoginUrl } from "../variables";

/**
 * EnrichedClient combines a Client with its associated Tenant and Connections.
 *
 * Instead of fetching this combined data through a special adapter,
 * use the getEnrichedClient helper function which fetches the entities
 * separately and composes them.
 */
export const enrichedClientSchema = z.object({
  ...clientSchema.shape,
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
});

export type EnrichedClient = z.infer<typeof enrichedClientSchema>;

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
export async function getEnrichedClient(
  env: Bindings,
  clientId: string,
  tenantId?: string,
): Promise<EnrichedClient> {
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

  // Fetch all data in parallel, including fallback connections
  const [fetchedClient, tenant, clientConnections, allConnections] =
    await Promise.all([
      client
        ? Promise.resolve(client)
        : env.data.clients.get(resolvedTenantId, clientId),
      env.data.tenants.get(resolvedTenantId),
      env.data.clientConnections.listByClient(resolvedTenantId, clientId),
      env.data.connections.list(resolvedTenantId),
    ]);

  const finalClient = client || fetchedClient;
  if (!finalClient) {
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

  const universalLoginUrl = getUniversalLoginUrl(env);

  return {
    ...finalClient,
    // Always include universal login URLs required for auth flows
    web_origins: [...(finalClient.web_origins || []), `${universalLoginUrl}login`],
    allowed_logout_urls: [...(finalClient.allowed_logout_urls || []), env.ISSUER],
    callbacks: [...(finalClient.callbacks || []), `${universalLoginUrl}info`],
    tenant,
    connections,
  };
}
