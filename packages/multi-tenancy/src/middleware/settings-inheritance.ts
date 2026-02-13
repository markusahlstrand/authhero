import {
  DataAdapters,
  Connection,
  Client,
  ResourceServer,
  ResourceServerScope,
  connectionSchema,
  connectionOptionsSchema,
} from "authhero";

/**
 * Merges a connection with control plane fallback options.
 */
function mergeConnectionWithFallback(
  connection: Connection,
  controlPlaneConnections: Connection[],
): Connection {
  // Match by strategy - allows tenants to use "google" strategy
  // and inherit OAuth credentials from control plane
  const controlPlaneConnection = controlPlaneConnections.find(
    (c) => c.strategy === connection.strategy,
  );

  if (!controlPlaneConnection?.options) {
    return connection;
  }

  const mergedConnection = connectionSchema.passthrough().parse({
    ...controlPlaneConnection,
    ...connection,
  });

  // Merge options with fallback - control plane options provide defaults,
  // tenant's own options override them
  mergedConnection.options = connectionOptionsSchema.passthrough().parse({
    ...(controlPlaneConnection.options || {}),
    ...connection.options,
  });

  return mergedConnection;
}

/**
 * Merges URL arrays from control plane client, deduplicating values.
 */
function mergeUrlArrays(
  tenantUrls: string[] | undefined,
  controlPlaneUrls: string[] | undefined,
): string[] {
  const combined = [
    ...(controlPlaneUrls || []),
    ...(tenantUrls || []),
  ];
  // Deduplicate while preserving order (tenant URLs take precedence)
  return [...new Set(combined)];
}

/**
 * Merges resource server scopes with control plane fallback.
 * Tenant-specific scopes override control plane scopes with the same value.
 */
function mergeResourceServerScopes(
  tenantScopes: ResourceServerScope[] | undefined,
  controlPlaneScopes: ResourceServerScope[] | undefined,
): ResourceServerScope[] {
  if (!controlPlaneScopes?.length) {
    return tenantScopes || [];
  }
  if (!tenantScopes?.length) {
    return controlPlaneScopes;
  }

  // Create a map with control plane scopes as base
  const scopeMap = new Map<string, ResourceServerScope>();
  for (const scope of controlPlaneScopes) {
    scopeMap.set(scope.value, scope);
  }
  // Tenant scopes override control plane scopes with the same value
  for (const scope of tenantScopes) {
    scopeMap.set(scope.value, scope);
  }

  return Array.from(scopeMap.values());
}

/**
 * Merges a resource server with control plane fallback scopes.
 */
function mergeResourceServerWithFallback(
  resourceServer: ResourceServer,
  controlPlaneResourceServer: ResourceServer | null,
): ResourceServer {
  if (!controlPlaneResourceServer) {
    return resourceServer;
  }

  return {
    ...resourceServer,
    scopes: mergeResourceServerScopes(
      resourceServer.scopes,
      controlPlaneResourceServer.scopes,
    ),
  };
}

/**
 * Merges a client with control plane fallback URLs.
 */
function mergeClientWithFallback(
  client: Client,
  controlPlaneClient: Client | null,
): Client {
  if (!controlPlaneClient) {
    return client;
  }

  return {
    ...client,
    callbacks: mergeUrlArrays(client.callbacks, controlPlaneClient.callbacks),
    web_origins: mergeUrlArrays(
      client.web_origins,
      controlPlaneClient.web_origins,
    ),
    allowed_logout_urls: mergeUrlArrays(
      client.allowed_logout_urls,
      controlPlaneClient.allowed_logout_urls,
    ),
    allowed_origins: mergeUrlArrays(
      client.allowed_origins,
      controlPlaneClient.allowed_origins,
    ),
  };
}

/**
 * Configuration for runtime settings fallback from a control plane tenant.
 *
 * Runtime fallback provides default values at query time without copying sensitive data.
 * This should only be used for auth flows, not for management API which should return
 * raw tenant data without any merging.
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
  const { controlPlaneTenantId, controlPlaneClientId } = config;

  return {
    ...baseAdapters,

    // Store config for use by tenants route access control
    multiTenancyConfig: {
      controlPlaneTenantId,
      controlPlaneClientId,
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

        return mergeConnectionWithFallback(
          connection,
          controlPlaneResult.connections || [],
        );
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
        const mergedConnections = result.connections.map((connection) =>
          mergeConnectionWithFallback(
            connection,
            controlPlaneResult.connections || [],
          ),
        );

        return {
          ...result,
          connections: mergedConnections,
        };
      },
    },

    clientConnections: {
      ...baseAdapters.clientConnections,

      listByClient: async (tenantId: string, clientId: string) => {
        let connections = await baseAdapters.clientConnections.listByClient(
          tenantId,
          clientId,
        );

        // If no connections are explicitly enabled for this client,
        // fall back to all connections from the tenant
        if (connections.length === 0) {
          const tenantConnections =
            await baseAdapters.connections.list(tenantId);
          connections = tenantConnections.connections || [];
        }

        if (!controlPlaneTenantId || tenantId === controlPlaneTenantId) {
          return connections;
        }

        // Get control plane connections for fallback
        const controlPlaneResult =
          await baseAdapters.connections.list(controlPlaneTenantId);

        // Merge connections with control plane fallbacks (matched by strategy)
        return connections.map((connection) =>
          mergeConnectionWithFallback(
            connection,
            controlPlaneResult.connections || [],
          ),
        );
      },
    },

    clients: {
      ...baseAdapters.clients,

      get: async (tenantId: string, clientId: string): Promise<Client | null> => {
        const client = await baseAdapters.clients.get(tenantId, clientId);
        if (!client) {
          return null;
        }

        // Skip fallback if no control plane configured
        if (!controlPlaneTenantId || !controlPlaneClientId) {
          return client;
        }

        // Skip fallback for the control plane client itself (avoid circular lookup)
        if (
          tenantId === controlPlaneTenantId &&
          clientId === controlPlaneClientId
        ) {
          return client;
        }

        // Get control plane client for URL merging
        const controlPlaneClient = await baseAdapters.clients.get(
          controlPlaneTenantId,
          controlPlaneClientId,
        );

        return mergeClientWithFallback(client, controlPlaneClient);
      },

      getByClientId: async (clientId: string): Promise<(Client & { tenant_id: string }) | null> => {
        const client = await baseAdapters.clients.getByClientId(clientId);
        if (!client) {
          return null;
        }

        // Skip fallback if no control plane configured
        if (!controlPlaneTenantId || !controlPlaneClientId) {
          return client;
        }

        // Skip fallback for the control plane client itself (avoid circular lookup)
        if (
          client.tenant_id === controlPlaneTenantId &&
          client.client_id === controlPlaneClientId
        ) {
          return client;
        }

        // Get control plane client for URL merging
        const controlPlaneClient = await baseAdapters.clients.get(
          controlPlaneTenantId,
          controlPlaneClientId,
        );

        return {
          ...mergeClientWithFallback(client, controlPlaneClient),
          tenant_id: client.tenant_id,
        };
      },
    },

    emailProviders: {
      ...baseAdapters.emailProviders,

      get: async (tenantId: string) => {
        const emailProvider =
          await baseAdapters.emailProviders.get(tenantId);

        // Return tenant's email provider if found
        if (emailProvider) {
          return emailProvider;
        }

        // Skip fallback for control plane tenant itself or if no control plane configured
        if (!controlPlaneTenantId || tenantId === controlPlaneTenantId) {
          return null;
        }

        // Fall back to control plane email provider
        return baseAdapters.emailProviders.get(controlPlaneTenantId);
      },
    },

    resourceServers: {
      ...baseAdapters.resourceServers,

      get: async (
        tenantId: string,
        id: string,
      ): Promise<ResourceServer | null> => {
        const resourceServer = await baseAdapters.resourceServers.get(
          tenantId,
          id,
        );
        if (!resourceServer || !controlPlaneTenantId) {
          return resourceServer;
        }

        // Skip fallback for control plane tenant itself
        if (tenantId === controlPlaneTenantId) {
          return resourceServer;
        }

        // Find matching control plane resource server by identifier for scope fallback
        const controlPlaneResult = await baseAdapters.resourceServers.list(
          controlPlaneTenantId,
          { q: `identifier:${resourceServer.identifier}`, per_page: 1 },
        );

        const controlPlaneResourceServer =
          controlPlaneResult.resource_servers[0] ?? null;

        return mergeResourceServerWithFallback(
          resourceServer,
          controlPlaneResourceServer,
        );
      },

      list: async (tenantId: string, params?) => {
        const result = await baseAdapters.resourceServers.list(tenantId, params);

        if (!controlPlaneTenantId || tenantId === controlPlaneTenantId) {
          return result;
        }

        // Get all control plane resource servers for scope fallback
        const controlPlaneResult = await baseAdapters.resourceServers.list(
          controlPlaneTenantId,
        );

        // Create a map of control plane resource servers by identifier
        const controlPlaneByIdentifier = new Map(
          controlPlaneResult.resource_servers.map((rs) => [rs.identifier, rs]),
        );

        // Merge each resource server with its control plane counterpart
        const mergedResourceServers = result.resource_servers.map((rs) =>
          mergeResourceServerWithFallback(
            rs,
            controlPlaneByIdentifier.get(rs.identifier) ?? null,
          ),
        );

        return {
          ...result,
          resource_servers: mergedResourceServers,
        };
      },
    },

    // Note: Additional adapters can be extended here for runtime fallback:
    // - promptSettings: Fall back to control plane prompts
    // - branding: Fall back to control plane branding/themes
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
