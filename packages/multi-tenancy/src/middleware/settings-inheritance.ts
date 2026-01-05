import {
  DataAdapters,
  LegacyClient,
  Connection,
  connectionSchema,
  connectionOptionsSchema,
} from "@authhero/adapter-interfaces";

/**
 * Configuration for runtime settings fallback from a control plane tenant.
 *
 * Runtime fallback provides default values at query time without copying sensitive data.
 */
export interface RuntimeFallbackConfig {
  /**
   * The control plane tenant ID from which settings are inherited at runtime.
   * Child tenants will fall back to this tenant's configuration for
   * missing or default values (e.g., connection secrets, SMTP settings).
   */
  controlPlaneTenantId?: string;

  /**
   * The control plane client ID used for fallback client settings.
   * This client's configuration (web_origins, callbacks, etc.) will
   * be merged with child tenant clients at runtime.
   */
  controlPlaneClientId?: string;
}

/**
 * Creates a data adapter wrapper that provides runtime settings fallback from a control plane tenant.
 *
 * This adapter wraps the base adapters to provide fallback functionality where child tenants
 * can inherit default configurations from a control plane (main) tenant **at runtime**.
 * This is useful for:
 *
 * - **Default connection settings**: Inherit OAuth secrets, SMTP API keys, etc. without copying them
 * - **Client URL fallbacks**: Add control plane URLs to allowed origins, callbacks, etc.
 * - **Tenant property defaults**: Fall back to control plane values for missing tenant settings
 *
 * **Key difference from entity sync:**
 * - **Runtime fallback**: Values are merged at query time, sensitive data stays in control plane only
 * - **Entity sync**: Entities are copied to child tenants, needed for foreign key relationships
 *
 * @param baseAdapters - The base data adapters to wrap
 * @param config - Configuration for runtime settings fallback
 * @returns Wrapped data adapters with runtime fallback functionality
 *
 * @example
 * ```typescript
 * import { createRuntimeFallbackAdapter } from "@authhero/multi-tenancy";
 * import createAdapters from "@authhero/kysely";
 *
 * const db = // ... your database connection
 * const baseAdapters = createAdapters(db);
 *
 * const adapters = createRuntimeFallbackAdapter(baseAdapters, {
 *   controlPlaneTenantId: "main",
 *   controlPlaneClientId: "main-client"
 * });
 * ```
 */
export function createRuntimeFallbackAdapter(
  baseAdapters: DataAdapters,
  config: RuntimeFallbackConfig,
): DataAdapters {
  const { controlPlaneTenantId, controlPlaneClientId } = config;

  return {
    ...baseAdapters,

    legacyClients: {
      ...baseAdapters.legacyClients,

      get: async (clientId: string): Promise<LegacyClient | null> => {
        const client = await baseAdapters.legacyClients.get(clientId);
        if (!client) {
          return null;
        }

        // Get the control plane client for fallback values
        const controlPlaneClient = controlPlaneClientId
          ? await baseAdapters.legacyClients.get(controlPlaneClientId)
          : undefined;

        // Get connections for this tenant
        const clientConnections = await baseAdapters.connections.list(
          client.tenant.id,
        );

        // Get control plane connections for fallback
        const controlPlaneConnections = controlPlaneTenantId
          ? await baseAdapters.connections.list(controlPlaneTenantId)
          : { connections: [] };

        // Merge connections with fallbacks
        const connections = clientConnections.connections
          .map((connection) => {
            const controlPlaneConnection =
              controlPlaneConnections.connections?.find(
                (c) => c.name === connection.name,
              );

            if (!controlPlaneConnection?.options) {
              return connection;
            }

            const mergedConnection = connectionSchema.parse({
              ...(controlPlaneConnection || {}),
              ...connection,
            });

            // Merge connection options with fallback
            mergedConnection.options = connectionOptionsSchema.parse({
              ...(controlPlaneConnection.options || {}),
              ...connection.options,
            });

            return mergedConnection;
          })
          .filter((c) => c);

        // Merge tenant properties with control plane fallbacks
        const mergedTenant = {
          ...(controlPlaneClient?.tenant || {}),
          ...client.tenant,
        };

        // Use control plane's audience as fallback if not set on client tenant
        if (!client.tenant.audience && controlPlaneClient?.tenant?.audience) {
          mergedTenant.audience = controlPlaneClient.tenant.audience;
        }

        // Return client with merged properties
        return {
          ...client,
          web_origins: [
            ...(controlPlaneClient?.web_origins || []),
            ...(client.web_origins || []),
          ],
          allowed_logout_urls: [
            ...(controlPlaneClient?.allowed_logout_urls || []),
            ...(client.allowed_logout_urls || []),
          ],
          callbacks: [
            ...(controlPlaneClient?.callbacks || []),
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
        if (!connection || !controlPlaneTenantId) {
          return connection;
        }

        // Try to get the control plane connection for fallback
        const controlPlaneConnection = await baseAdapters.connections.get(
          controlPlaneTenantId,
          connectionId,
        );

        if (!controlPlaneConnection) {
          return connection;
        }

        // Merge connection with control plane fallback
        const mergedConnection = connectionSchema.parse({
          ...controlPlaneConnection,
          ...connection,
        });

        // Merge options with fallback
        mergedConnection.options = connectionOptionsSchema.parse({
          ...(controlPlaneConnection.options || {}),
          ...connection.options,
        });

        return mergedConnection;
      },

      list: async (tenantId: string, params?) => {
        const result = await baseAdapters.connections.list(tenantId, params);

        if (!controlPlaneTenantId || tenantId === controlPlaneTenantId) {
          return result;
        }

        // Get control plane connections for fallback
        const controlPlaneResult =
          await baseAdapters.connections.list(controlPlaneTenantId);

        // Merge connections with control plane fallbacks
        const mergedConnections = result.connections.map((connection) => {
          const controlPlaneConnection = controlPlaneResult.connections?.find(
            (c) => c.name === connection.name,
          );

          if (!controlPlaneConnection?.options) {
            return connection;
          }

          const mergedConnection = connectionSchema.parse({
            ...controlPlaneConnection,
            ...connection,
          });

          // Merge options with fallback
          mergedConnection.options = connectionOptionsSchema.parse({
            ...(controlPlaneConnection.options || {}),
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

    // Note: Additional adapters can be extended here for runtime fallback:
    // - promptSettings: Fall back to control plane prompts
    // - branding: Fall back to control plane branding/themes
    // - emailProviders: Fall back to control plane SMTP settings
    //
    // For now, we pass through other adapters unchanged.
    // They remain part of ...baseAdapters and can be properly wrapped by caching.
  };
}

/**
 * Helper function to wrap data adapters with runtime fallback from control plane.
 *
 * This is a convenience wrapper around `createRuntimeFallbackAdapter`.
 *
 * @param baseAdapters - The base data adapters to wrap
 * @param config - Configuration for runtime fallback
 * @returns Wrapped data adapters with runtime fallback functionality
 *
 * @example
 * ```typescript
 * import { withRuntimeFallback } from "@authhero/multi-tenancy";
 *
 * const adapters = withRuntimeFallback(baseAdapters, {
 *   controlPlaneTenantId: "main",
 *   controlPlaneClientId: "main-client"
 * });
 * ```
 */
export function withRuntimeFallback(
  baseAdapters: DataAdapters,
  config: RuntimeFallbackConfig,
): DataAdapters {
  return createRuntimeFallbackAdapter(baseAdapters, config);
}

// Legacy aliases for backward compatibility
/**
 * @deprecated Use `RuntimeFallbackConfig` instead
 */
export type SettingsInheritanceConfig = RuntimeFallbackConfig;

/**
 * @deprecated Use `createRuntimeFallbackAdapter` instead
 */
export const createSettingsInheritanceAdapter = createRuntimeFallbackAdapter;

/**
 * @deprecated Use `withRuntimeFallback` instead
 */
export const withSettingsInheritance = withRuntimeFallback;
