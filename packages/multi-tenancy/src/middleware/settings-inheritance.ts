import {
  DataAdapters,
  LegacyClient,
  Connection,
  connectionSchema,
  connectionOptionsSchema,
} from "authhero";
import { z } from "@hono/zod-openapi";

type ConnectionOptions = z.infer<typeof connectionOptionsSchema>;

/**
 * Sensitive fields in connection options that should not be exposed
 * through the management API when using control plane fallback.
 */
const SENSITIVE_CONNECTION_FIELDS: (keyof ConnectionOptions)[] = [
  "client_secret",
  "app_secret",
  "twilio_token",
];

/**
 * Strips sensitive fields from connection options.
 * Used to prevent control plane secrets from being exposed through the management API.
 */
function stripSensitiveFields(
  options: ConnectionOptions | undefined,
): ConnectionOptions | undefined {
  if (!options) return options;

  const result = { ...options };
  for (const field of SENSITIVE_CONNECTION_FIELDS) {
    delete result[field];
  }
  return result;
}

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

  /**
   * When true, excludes sensitive fields (client_secret, app_secret, twilio_token)
   * from the control plane fallback. Use this for management API adapters to prevent
   * tenants from accessing control plane secrets.
   *
   * @default false
   */
  excludeSensitiveFields?: boolean;
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
 * **Connection fallback by strategy:**
 * Connections are matched by **strategy** (e.g., "google", "facebook", "email") rather than by name.
 * This allows tenants to create a connection with a strategy like "google" and leave keys blank,
 * and the system will automatically merge in the OAuth credentials from the control plane's
 * google connection. This is the recommended approach for sharing social auth across tenants.
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
  const {
    controlPlaneTenantId,
    controlPlaneClientId,
    excludeSensitiveFields = false,
  } = config;

  return {
    ...baseAdapters,

    // Store config for use by tenants route access control
    multiTenancyConfig: {
      controlPlaneTenantId,
      controlPlaneClientId,
    },

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

        // Merge connections with fallbacks (matched by strategy)
        const connections = clientConnections.connections
          .map((connection) => {
            // Match by strategy instead of name - this allows tenants to define
            // a "google" strategy connection and inherit OAuth credentials from control plane
            const controlPlaneConnection =
              controlPlaneConnections.connections?.find(
                (c) => c.strategy === connection.strategy,
              );

            if (!controlPlaneConnection?.options) {
              return connection;
            }

            const mergedConnection = connectionSchema.parse({
              ...(controlPlaneConnection || {}),
              ...connection,
            });

            // Merge connection options with fallback
            // If excludeSensitiveFields is true, strip sensitive fields from control plane options
            const controlPlaneOptions = excludeSensitiveFields
              ? stripSensitiveFields(controlPlaneConnection.options)
              : controlPlaneConnection.options;
            mergedConnection.options = connectionOptionsSchema.parse({
              ...(controlPlaneOptions || {}),
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

        // Skip fallback for control plane tenant itself
        if (tenantId === controlPlaneTenantId) {
          return connection;
        }

        // Find control plane connection by strategy for fallback
        const controlPlaneResult =
          await baseAdapters.connections.list(controlPlaneTenantId);
        const controlPlaneConnection = controlPlaneResult.connections?.find(
          (c) => c.strategy === connection.strategy,
        );

        if (!controlPlaneConnection?.options) {
          return connection;
        }

        // Merge connection with control plane fallback
        const mergedConnection = connectionSchema.parse({
          ...controlPlaneConnection,
          ...connection,
        });

        // Merge options with fallback
        // If excludeSensitiveFields is true, strip sensitive fields from control plane options
        const controlPlaneOptions = excludeSensitiveFields
          ? stripSensitiveFields(controlPlaneConnection.options)
          : controlPlaneConnection.options;
        mergedConnection.options = connectionOptionsSchema.parse({
          ...(controlPlaneOptions || {}),
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

        // Merge connections with control plane fallbacks (matched by strategy)
        const mergedConnections = result.connections.map((connection) => {
          // Match by strategy - allows tenants to use "google" strategy
          // and inherit OAuth credentials from control plane
          const controlPlaneConnection = controlPlaneResult.connections?.find(
            (c) => c.strategy === connection.strategy,
          );

          if (!controlPlaneConnection?.options) {
            return connection;
          }

          const mergedConnection = connectionSchema.parse({
            ...controlPlaneConnection,
            ...connection,
          });

          // Merge options with fallback
          // If excludeSensitiveFields is true, strip sensitive fields from control plane options
          const controlPlaneOptions = excludeSensitiveFields
            ? stripSensitiveFields(controlPlaneConnection.options)
            : controlPlaneConnection.options;
          mergedConnection.options = connectionOptionsSchema.parse({
            ...(controlPlaneOptions || {}),
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
