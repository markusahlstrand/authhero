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
  const combined = [...(controlPlaneUrls || []), ...(tenantUrls || [])];
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
 *
 * Returns a new Client whose callbacks, web_origins, allowed_logout_urls and
 * allowed_origins include both the tenant client's own values and the control
 * plane client's values (deduplicated, tenant values take precedence). Other
 * fields are taken verbatim from the tenant client.
 *
 * This is intended for runtime auth flows (e.g. `/authorize`, token issuance)
 * that need to accept the control plane's URLs. Storage reads (management API,
 * DCR) must NOT use this — the merged URLs would be written back on update.
 */
export function mergeClientWithFallback(
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
 * Resolved inheritance target for a single tenant. `undefined` means the
 * tenant opts out of inheritance entirely.
 */
type ResolvedControlPlane =
  | { tenantId: string; clientId?: string }
  | undefined;

/**
 * Per-tenant resolver for the inheritance control plane. Receives the
 * tenant currently being read and returns which control plane it should
 * inherit from, or `undefined` to disable inheritance for that tenant.
 *
 * Mirrors the shape of `SigningKeyModeResolver` in authhero so callers can
 * write `({ tenant_id }) => DISABLED.has(tenant_id) ? undefined : {...}`.
 */
export type ControlPlaneResolver = (params: { tenant_id: string }) =>
  | ResolvedControlPlane
  | Promise<ResolvedControlPlane>;

/**
 * Builds a single resolver from either a static `{tenantId, clientId}` pair
 * or a user-supplied resolver. The user-supplied resolver, when present,
 * fully replaces the static fallback — that's the lever a caller uses to
 * disable inheritance for individual tenants by returning `undefined`.
 */
function buildResolver(config: {
  controlPlaneTenantId?: string;
  controlPlaneClientId?: string;
  resolveControlPlane?: ControlPlaneResolver;
}): (tenantId: string) => Promise<ResolvedControlPlane> {
  const { controlPlaneTenantId, controlPlaneClientId, resolveControlPlane } =
    config;

  if (resolveControlPlane) {
    return async (tenantId) => resolveControlPlane({ tenant_id: tenantId });
  }

  if (!controlPlaneTenantId) {
    return async () => undefined;
  }

  const staticResult: ResolvedControlPlane = {
    tenantId: controlPlaneTenantId,
    clientId: controlPlaneClientId,
  };
  return async () => staticResult;
}

/**
 * Wraps resourceServers adapter methods with is_system-gated scope inheritance.
 * Only resource_servers with is_system === true get scopes merged from the
 * control plane counterpart (looked up by id, since sync preserves the id).
 */
function wrapResourceServersWithSystemInheritance(
  baseAdapters: DataAdapters,
  resolve: (tenantId: string) => Promise<ResolvedControlPlane>,
): DataAdapters["resourceServers"] {
  return {
    ...baseAdapters.resourceServers,

    get: async (
      tenantId: string,
      id: string,
    ): Promise<ResourceServer | null> => {
      const resourceServer = await baseAdapters.resourceServers.get(
        tenantId,
        id,
      );
      if (!resourceServer) {
        return resourceServer;
      }

      const cp = await resolve(tenantId);
      if (!cp || tenantId === cp.tenantId) {
        return resourceServer;
      }

      if (!resourceServer.is_system) {
        return resourceServer;
      }

      const controlPlaneResourceServer = await baseAdapters.resourceServers.get(
        cp.tenantId,
        id,
      );

      return mergeResourceServerWithFallback(
        resourceServer,
        controlPlaneResourceServer,
      );
    },

    list: async (tenantId: string, params?) => {
      const result = await baseAdapters.resourceServers.list(tenantId, params);

      const cp = await resolve(tenantId);
      if (!cp || tenantId === cp.tenantId) {
        return result;
      }

      const cpTenantId = cp.tenantId;
      const systemIds = result.resource_servers
        .filter((rs): rs is ResourceServer & { id: string } =>
          Boolean(rs.is_system && rs.id),
        )
        .map((rs) => rs.id);

      if (systemIds.length === 0) {
        return result;
      }

      const controlPlaneById = new Map<string, ResourceServer>();
      await Promise.all(
        systemIds.map(async (id) => {
          const cp = await baseAdapters.resourceServers.get(cpTenantId, id);
          if (cp) {
            controlPlaneById.set(id, cp);
          }
        }),
      );

      const mergedResourceServers = result.resource_servers.map((rs) =>
        rs.is_system && rs.id
          ? mergeResourceServerWithFallback(
              rs,
              controlPlaneById.get(rs.id) ?? null,
            )
          : rs,
      );

      return {
        ...result,
        resource_servers: mergedResourceServers,
      };
    },
  };
}

/**
 * Wraps data adapters with is_system-gated resource server scope inheritance
 * from a control plane tenant.
 *
 * This is a narrow wrapper intended for the management adapter: it only
 * overrides resourceServers.get and resourceServers.list so that
 * is_system resource servers show inherited scopes, without merging
 * connections, clients, or email providers.
 */
export function withSystemResourceServerInheritance(
  baseAdapters: DataAdapters,
  config: {
    controlPlaneTenantId?: string;
    resolveControlPlane?: ControlPlaneResolver;
  },
): DataAdapters {
  const resolve = buildResolver({
    controlPlaneTenantId: config.controlPlaneTenantId,
    resolveControlPlane: config.resolveControlPlane,
  });
  return {
    ...baseAdapters,
    resourceServers: wrapResourceServersWithSystemInheritance(
      baseAdapters,
      resolve,
    ),
  };
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
   * Optional per-tenant resolver. When provided, replaces the static
   * `controlPlaneTenantId` / `controlPlaneClientId` fields for inheritance
   * lookups: every wrapped adapter read calls this with the tenant being
   * read, and the returned `{tenantId, clientId}` decides which tenant to
   * fall back to. Return `undefined` to opt a specific tenant out of
   * inheritance entirely.
   *
   * The static fields are still exposed via `multiTenancyConfig` on the
   * wrapped adapter for access-control checks that need a single global
   * control plane id.
   */
  resolveControlPlane?: ControlPlaneResolver;
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
  const { controlPlaneTenantId, controlPlaneClientId, resolveControlPlane } =
    config;
  const resolve = buildResolver({
    controlPlaneTenantId,
    controlPlaneClientId,
    resolveControlPlane,
  });

  return {
    ...baseAdapters,

    // Store the static config for use by tenants route access control.
    // Per-tenant inheritance overrides do NOT affect access-control values —
    // those intentionally use a single global control plane id. The resolver
    // is exposed here so runtime helpers (e.g. `getEnrichedClient`) can
    // consult it before merging control-plane URLs.
    multiTenancyConfig: {
      controlPlaneTenantId,
      controlPlaneClientId,
      resolveControlPlane,
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
        if (!connection) {
          return connection;
        }

        const cp = await resolve(tenantId);
        if (!cp || tenantId === cp.tenantId) {
          return connection;
        }

        // Find control plane connection by strategy for fallback
        const controlPlaneResult = await baseAdapters.connections.list(
          cp.tenantId,
        );

        return mergeConnectionWithFallback(
          connection,
          controlPlaneResult.connections || [],
        );
      },

      list: async (tenantId: string, params?) => {
        const result = await baseAdapters.connections.list(tenantId, params);

        const cp = await resolve(tenantId);
        if (!cp || tenantId === cp.tenantId) {
          return result;
        }

        // Get control plane connections for fallback
        const controlPlaneResult = await baseAdapters.connections.list(
          cp.tenantId,
        );

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

        const cp = await resolve(tenantId);
        if (!cp || tenantId === cp.tenantId) {
          return connections;
        }

        // Get control plane connections for fallback
        const controlPlaneResult = await baseAdapters.connections.list(
          cp.tenantId,
        );

        // Merge connections with control plane fallbacks (matched by strategy)
        return connections.map((connection) =>
          mergeConnectionWithFallback(
            connection,
            controlPlaneResult.connections || [],
          ),
        );
      },
    },

    // Note: clients.get / getByClientId are intentionally NOT wrapped here.
    // Storage reads must return the tenant's own stored URLs so that the
    // management API and DCR don't echo control-plane callbacks back on
    // update. Runtime URL merging for auth flows happens in
    // `getEnrichedClient` (packages/authhero/src/helpers/client.ts).

    emailProviders: {
      ...baseAdapters.emailProviders,

      get: async (tenantId: string) => {
        const emailProvider = await baseAdapters.emailProviders.get(tenantId);

        // Return tenant's email provider if found
        if (emailProvider) {
          return emailProvider;
        }

        const cp = await resolve(tenantId);
        if (!cp || tenantId === cp.tenantId) {
          return null;
        }

        // Fall back to control plane email provider
        return baseAdapters.emailProviders.get(cp.tenantId);
      },
    },

    resourceServers: wrapResourceServersWithSystemInheritance(
      baseAdapters,
      resolve,
    ),

    hooks: wrapHooksWithInheritance(baseAdapters, resolve),

    // Note: Additional adapters can be extended here for runtime fallback:
    // - promptSettings: Fall back to control plane prompts
    // - branding: Fall back to control plane branding/themes
  };
}

/**
 * Returns true when a hook is marked as inheritable by the control plane.
 * Inheritable hooks surface on every sub-tenant's `hooks.list` so a single
 * control-plane row drives behaviour fleet-wide. Reads `metadata.inheritable`
 * on any hook variant (web/form/template/code).
 */
function isInheritableHook(hook: unknown): boolean {
  if (!hook || typeof hook !== "object") return false;
  const metadata = (hook as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).inheritable === true;
}

/**
 * Wraps the hooks adapter so child tenants see hooks the control plane
 * marked as inheritable (`metadata.inheritable === true`) merged into their
 * own list/get results. Inherited hooks are read-only from a sub-tenant's
 * perspective: writes go through the base adapter's `tenant_id` clause and
 * therefore can't touch a row owned by the control plane.
 *
 * Filter (`q`) and pagination params are applied to each side independently
 * by the base adapter, then concatenated. For the `q` shapes the runtime
 * uses (`trigger_id:foo`) this gives correct results because both sides
 * filter consistently. The combined `length` for `include_totals: true`
 * is the sum of both sides.
 */
function wrapHooksWithInheritance(
  baseAdapters: DataAdapters,
  resolve: (tenantId: string) => Promise<ResolvedControlPlane>,
): DataAdapters["hooks"] {
  return {
    ...baseAdapters.hooks,

    list: async (tenantId: string, params?) => {
      const result = await baseAdapters.hooks.list(tenantId, params);

      const cp = await resolve(tenantId);
      if (!cp || tenantId === cp.tenantId) {
        return result;
      }

      const controlPlaneResult = await baseAdapters.hooks.list(
        cp.tenantId,
        params,
      );

      const inherited = (controlPlaneResult.hooks || []).filter(
        isInheritableHook,
      );

      if (inherited.length === 0) {
        return result;
      }

      // Sub-tenant rows take precedence — if both sides somehow share the
      // same hook_id (vanishingly unlikely with random ids) keep the local.
      const localIds = new Set((result.hooks || []).map((h) => h.hook_id));
      const additions = inherited.filter((h) => !localIds.has(h.hook_id));

      return {
        ...result,
        hooks: [...(result.hooks || []), ...additions],
        length:
          typeof result.length === "number"
            ? result.length + additions.length
            : result.length,
      };
    },

    get: async (tenantId: string, hookId: string) => {
      const local = await baseAdapters.hooks.get(tenantId, hookId);
      if (local) return local;

      const cp = await resolve(tenantId);
      if (!cp || tenantId === cp.tenantId) {
        return local;
      }

      const controlPlaneHook = await baseAdapters.hooks.get(
        cp.tenantId,
        hookId,
      );
      return controlPlaneHook && isInheritableHook(controlPlaneHook)
        ? controlPlaneHook
        : null;
    },
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
