import { z } from "@hono/zod-openapi";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  clientSchema,
  connectionOptionsSchema,
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

  // Fetch remaining data in parallel
  const [fetchedClient, tenant, connections] = await Promise.all([
    client ? Promise.resolve(client) : env.data.clients.get(resolvedTenantId, clientId),
    env.data.tenants.get(resolvedTenantId),
    env.data.clientConnections.listByClient(resolvedTenantId, clientId),
  ]);

  const finalClient = client || fetchedClient;
  if (!finalClient) {
    throw new JSONHTTPException(403, { message: "Client not found" });
  }
  if (!tenant) {
    throw new JSONHTTPException(404, { message: "Tenant not found" });
  }

  return {
    ...finalClient,
    tenant,
    connections,
  };
}

// DEPRECATED: Legacy fallback logic for backward compatibility
// This duplicates the functionality of withRuntimeFallback from @authhero/multi-tenancy
// Once all environments use withRuntimeFallback adapter, this code can be removed
// See: https://github.com/authhero/authhero/blob/main/packages/multi-tenancy/src/middleware/settings-inheritance.ts

export async function getClientWithDefaults(
  env: Bindings,
  clientId: string,
): Promise<EnrichedClient> {
  const client = await getEnrichedClient(env, clientId);

  // Check if we have default tenant/client configuration for backward compatibility
  // If we do, apply the old fallback logic for cases where main tenant adapter isn't used
  let processedClient = client;

  if (env.DEFAULT_CLIENT_ID || env.DEFAULT_TENANT_ID) {
    const defaultClient = env.DEFAULT_CLIENT_ID
      ? await getEnrichedClient(env, env.DEFAULT_CLIENT_ID)
      : undefined;

    // Get connections that are enabled for this client
    // If no connections are explicitly defined, use all connections from the tenant
    const hasDefinedConnections =
      client.connections && client.connections.length > 0;
    const enabledConnectionIds = hasDefinedConnections
      ? new Set(client.connections.map((c) => c.id))
      : null;

    const clientConnections = await env.data.connections.list(client.tenant.id);

    const defaultConnections = env.DEFAULT_TENANT_ID
      ? await env.data.connections.list(env.DEFAULT_TENANT_ID)
      : { connections: [] };

    // Filter and merge connections
    const allConnections = clientConnections.connections
      .filter((connection) =>
        enabledConnectionIds === null
          ? true
          : enabledConnectionIds.has(connection.id || ""),
      )
      .map((connection) => {
        const defaultConnection = defaultConnections.connections?.find(
          (c) => c.name === connection.name,
        );

        if (!defaultConnection?.options) {
          return connection;
        }

        const mergedConnection = connectionSchema.parse({
          ...(defaultConnection || {}),
          ...connection,
        });

        // Merge connection options
        mergedConnection.options = connectionOptionsSchema.parse({
          ...(defaultConnection.options || {}),
          ...connection.options,
        });

        return mergedConnection;
      })
      .filter((c) => c);

    // Preserve the order from the client's enabled connections
    const connections = hasDefinedConnections
      ? client.connections
          .map((enabledConn) =>
            allConnections.find((c) => c.id === enabledConn.id),
          )
          .filter((c): c is NonNullable<typeof c> => c !== undefined)
      : allConnections;

    processedClient = {
      ...client,
      web_origins: [
        ...(defaultClient?.web_origins || []),
        ...(client.web_origins || []),
      ],
      allowed_logout_urls: [
        ...(defaultClient?.allowed_logout_urls || []),
        ...(client.allowed_logout_urls || []),
      ],
      callbacks: [
        ...(defaultClient?.callbacks || []),
        ...(client.callbacks || []),
      ],
      connections,
      tenant: {
        ...(defaultClient?.tenant || {}),
        ...client.tenant,
      },
    };
  }

  // Always add universal login URLs that are required
  return {
    ...processedClient,
    web_origins: [
      ...(processedClient.web_origins || []),
      `${getUniversalLoginUrl(env)}login`,
    ],
    allowed_logout_urls: [
      ...(processedClient.allowed_logout_urls || []),
      env.ISSUER,
    ],
    callbacks: [
      ...(processedClient.callbacks || []),
      `${getUniversalLoginUrl(env)}info`,
    ],
  };
}
