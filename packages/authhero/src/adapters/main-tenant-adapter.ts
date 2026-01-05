import {
  DataAdapters,
  LegacyClient,
  Connection,
  connectionSchema,
  connectionOptionsSchema,
} from "@authhero/adapter-interfaces";

/**
 * @deprecated Use `RuntimeFallbackConfig` from `@authhero/multi-tenancy` instead.
 */
export interface MainTenantAdapterConfig {
  mainTenantId?: string;
  mainClientId?: string;
}

/**
 * Main tenant adapter that wraps other adapters to provide fallback functionality
 * from a main tenant. This allows tenants to inherit default configurations.
 *
 * @deprecated Use `withRuntimeFallback` or `createRuntimeFallbackAdapter` from `@authhero/multi-tenancy` instead.
 * This function will be removed in a future version.
 *
 * @see https://github.com/markusahlstrand/authhero/blob/main/packages/multi-tenancy/src/middleware/settings-inheritance.ts
 *
 * @example
 * ```typescript
 * // Migrate to:
 * import { withRuntimeFallback } from "@authhero/multi-tenancy";
 *
 * const adapters = withRuntimeFallback(baseAdapters, {
 *   controlPlaneTenantId: "main",
 *   controlPlaneClientId: "main-client"
 * });
 * ```
 */
export function createMainTenantAdapter(
  baseAdapters: DataAdapters,
  config: MainTenantAdapterConfig,
): DataAdapters {
  const { mainTenantId, mainClientId } = config;

  return {
    ...baseAdapters,

    legacyClients: {
      get: async (clientId: string): Promise<LegacyClient | null> => {
        const client = await baseAdapters.legacyClients.get(clientId);
        if (!client) {
          return null;
        }

        // Get the main client for fallback values
        const mainClient = mainClientId
          ? await baseAdapters.legacyClients.get(mainClientId)
          : undefined;

        // Get connections for this tenant
        const clientConnections = await baseAdapters.connections.list(
          client.tenant.id,
        );

        // Get main tenant connections for fallback
        const mainConnections = mainTenantId
          ? await baseAdapters.connections.list(mainTenantId)
          : { connections: [] };

        // Merge connections with fallbacks
        const connections = clientConnections.connections
          .map((connection) => {
            const mainConnection = mainConnections.connections?.find(
              (c) => c.name === connection.name,
            );

            if (!mainConnection?.options) {
              return connection;
            }

            const mergedConnection = connectionSchema.parse({
              ...(mainConnection || {}),
              ...connection,
            });

            // Merge connection options with fallback
            mergedConnection.options = connectionOptionsSchema.parse({
              ...(mainConnection.options || {}),
              ...connection.options,
            });

            return mergedConnection;
          })
          .filter((c) => c);

        // Merge tenant properties with main tenant fallbacks
        const mergedTenant = {
          ...(mainClient?.tenant || {}),
          ...client.tenant,
        };

        // Use main tenant's audience as fallback if not set on client tenant
        if (!client.tenant.audience && mainClient?.tenant?.audience) {
          mergedTenant.audience = mainClient.tenant.audience;
        }

        // Return client with merged properties
        return {
          ...client,
          web_origins: [
            ...(mainClient?.web_origins || []),
            ...(client.web_origins || []),
          ],
          allowed_logout_urls: [
            ...(mainClient?.allowed_logout_urls || []),
            ...(client.allowed_logout_urls || []),
          ],
          callbacks: [
            ...(mainClient?.callbacks || []),
            ...(client.callbacks || []),
          ],
          connections,
          tenant: mergedTenant,
        };
      },
    },

    connections: {
      ...baseAdapters.connections,

      get: async (
        tenantId: string,
        connectionId: string,
      ): Promise<Connection | null> => {
        const connection = await baseAdapters.connections.get(
          tenantId,
          connectionId,
        );
        if (!connection || !mainTenantId) {
          return connection;
        }

        // Try to get the main tenant connection for fallback
        const mainConnection = await baseAdapters.connections.get(
          mainTenantId,
          connectionId,
        );

        if (!mainConnection) {
          return connection;
        }

        // Merge connection with main tenant fallback
        const mergedConnection = connectionSchema.parse({
          ...mainConnection,
          ...connection,
        });

        // Merge options with fallback
        mergedConnection.options = connectionOptionsSchema.parse({
          ...(mainConnection.options || {}),
          ...connection.options,
        });

        return mergedConnection;
      },

      list: async (tenantId: string, params?) => {
        const result = await baseAdapters.connections.list(tenantId, params);

        if (!mainTenantId || tenantId === mainTenantId) {
          return result;
        }

        // Get main tenant connections for fallback
        const mainResult = await baseAdapters.connections.list(mainTenantId);

        // Merge connections with main tenant fallbacks
        const mergedConnections = result.connections.map((connection) => {
          const mainConnection = mainResult.connections?.find(
            (c) => c.name === connection.name,
          );

          if (!mainConnection?.options) {
            return connection;
          }

          const mergedConnection = connectionSchema.parse({
            ...mainConnection,
            ...connection,
          });

          // Merge options with fallback
          mergedConnection.options = connectionOptionsSchema.parse({
            ...(mainConnection.options || {}),
            ...connection.options,
          });

          return mergedConnection;
        });

        return {
          ...result,
          connections: mergedConnections,
        };
      },
    },

    // For other tenant-scoped adapters, we could add similar fallback logic
    // but for now we'll just pass them through by not overriding them
    // This ensures they get properly wrapped by any outer wrappers (like caching)

    // Note: We intentionally do NOT override these adapters so they remain
    // part of the spread ...baseAdapters and can be properly wrapped by caching
  };
}
