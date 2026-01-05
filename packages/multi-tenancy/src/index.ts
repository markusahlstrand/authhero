import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  init as initAuthHero,
  AuthHeroConfig,
  ManagementApiExtension,
} from "authhero";
import {
  MultiTenancyConfig,
  MultiTenancyHooks,
  MultiTenancyBindings,
  MultiTenancyVariables,
} from "./types";
import {
  createAccessControlHooks,
  createDatabaseHooks,
  createProvisioningHooks,
} from "./hooks";
import { createTenantsOpenAPIRouter } from "./routes";
import {
  createMultiTenancyMiddleware,
  createProtectSyncedMiddleware,
} from "./middleware";
import { createSyncHooks } from "./hooks/sync";
import { fetchAll } from "authhero";

// Re-export everything from authhero for convenience
// This allows consumers to import from @authhero/multi-tenancy without also needing authhero
export * from "authhero";

// Re-export all multi-tenancy types
export * from "./types";

// Public API - functions and types consumers actually need
export { createSyncHooks } from "./hooks/sync";
export type {
  EntitySyncConfig,
  SyncHooksResult,
  EntityHooks,
} from "./hooks/sync";

export { createTenantsOpenAPIRouter } from "./routes";

export {
  createMultiTenancyMiddleware,
  createAccessControlMiddleware,
  createSubdomainMiddleware,
  createDatabaseMiddleware,
  createProtectSyncedMiddleware,
  createRuntimeFallbackAdapter,
  withRuntimeFallback,
  // Legacy aliases for backward compatibility
  createSettingsInheritanceAdapter,
  withSettingsInheritance,
} from "./middleware";
export type { RuntimeFallbackConfig, SettingsInheritanceConfig } from "./middleware";

export { createMultiTenancyPlugin } from "./plugin";
export type { AuthHeroPlugin } from "./plugin";

// Internal hooks - exported for advanced use cases only
export {
  createAccessControlHooks,
  createDatabaseHooks,
  createProvisioningHooks,
} from "./hooks";
export { validateTenantAccess } from "./hooks/access-control";
export type { DatabaseFactory } from "./hooks/database";

/**
 * Creates multi-tenancy hooks from configuration.
 *
 * This combines access control, database resolution, and provisioning hooks
 * into a single hooks object that can be passed to AuthHero.
 *
 * @param config - Multi-tenancy configuration
 * @returns Combined hooks for multi-tenancy support
 *
 * @example
 * ```typescript
 * import { createMultiTenancyHooks } from "@authhero/multi-tenancy";
 *
 * const hooks = createMultiTenancyHooks({
 *   accessControl: {
 *     controlPlaneTenantId: "control_plane",
 *     defaultPermissions: ["tenant:admin"],
 *   },
 *   databaseIsolation: {
 *     getAdapters: async (tenantId) => getDatabase(tenantId),
 *   },
 * });
 * ```
 */
export function createMultiTenancyHooks(
  config: MultiTenancyConfig,
): MultiTenancyHooks {
  const accessHooks = config.accessControl
    ? createAccessControlHooks(config.accessControl)
    : {};

  const dbHooks = config.databaseIsolation
    ? createDatabaseHooks(config.databaseIsolation)
    : {};

  const provisioningHooks = createProvisioningHooks(config);

  return {
    ...accessHooks,
    ...dbHooks,
    tenants: provisioningHooks,
  };
}

/**
 * Creates a complete multi-tenancy Hono app with routes and middleware.
 *
 * This creates a Hono app with:
 * - Tenant management routes (CRUD for tenants)
 * - Access control middleware
 * - Subdomain routing (optional)
 * - Database resolution (optional)
 *
 * @param config - Multi-tenancy configuration
 * @returns Hono app with multi-tenancy routes
 *
 * @example
 * ```typescript
 * import { createMultiTenancy } from "@authhero/multi-tenancy";
 *
 * const multiTenancyApp = createMultiTenancy({
 *   accessControl: {
 *     controlPlaneTenantId: "main",
 *   },
 * });
 *
 * // Mount on your main app
 * app.route("/management", multiTenancyApp);
 * ```
 */
export function createMultiTenancy(config: MultiTenancyConfig) {
  const app = new Hono<{
    Bindings: MultiTenancyBindings;
    Variables: MultiTenancyVariables;
  }>();

  const hooks = createMultiTenancyHooks(config);

  // Mount tenant management routes
  app.route("/tenants", createTenantsOpenAPIRouter(config, hooks));

  return app;
}

/**
 * Creates a multi-tenancy setup with both hooks and middleware.
 *
 * This is a convenience function that returns everything needed to
 * integrate multi-tenancy into an AuthHero application.
 *
 * @param config - Multi-tenancy configuration
 * @returns Object with hooks, middleware, and routes
 *
 * @example
 * ```typescript
 * import { setupMultiTenancy } from "@authhero/multi-tenancy";
 *
 * const multiTenancy = setupMultiTenancy({
 *   accessControl: {
 *     controlPlaneTenantId: "main",
 *   },
 *   subdomainRouting: {
 *     baseDomain: "auth.example.com",
 *   },
 * });
 *
 * // Use the middleware
 * app.use("*", multiTenancy.middleware);
 *
 * // Mount the routes
 * app.route("/management", multiTenancy.app);
 *
 * // Pass hooks to AuthHero
 * const authhero = createAuthhero({
 *   hooks: multiTenancy.hooks,
 * });
 * ```
 */
export function setupMultiTenancy(config: MultiTenancyConfig) {
  return {
    hooks: createMultiTenancyHooks(config),
    middleware: createMultiTenancyMiddleware(config),
    app: createMultiTenancy(config),
    config,
  };
}

/**
 * Configuration for multi-tenant AuthHero initialization.
 */
export interface MultiTenantAuthHeroConfig extends Omit<
  AuthHeroConfig,
  "entityHooks" | "managementApiExtensions"
> {
  /**
   * The control plane tenant ID that manages all other tenants.
   * This tenant can create, update, and delete other tenants.
   * @default "main"
   */
  controlPlaneTenantId?: string;

  /**
   * Configuration for syncing entities from the control plane to child tenants.
   * All sync options default to true.
   */
  sync?: {
    /**
     * Whether to sync resource servers from the control plane to child tenants.
     * When enabled, resource servers created on the control plane are automatically
     * copied to all other tenants.
     * @default true
     */
    resourceServers?: boolean;

    /**
     * Whether to sync roles from the control plane to child tenants.
     * When enabled, roles created on the control plane are automatically
     * copied to all other tenants (including their permissions).
     * @default true
     */
    roles?: boolean;

    /**
     * Whether to sync connections from the control plane to child tenants.
     * When enabled, connections created on the control plane are automatically
     * copied to all other tenants (without sensitive credentials like client_id,
     * client_secret, app_secret, kid, team_id, twilio_sid, twilio_token).
     * @default true
     */
    connections?: boolean;
  };

  /**
   * Additional multi-tenancy configuration options.
   */
  multiTenancy?: Omit<MultiTenancyConfig, "accessControl"> & {
    accessControl?: Omit<
      NonNullable<MultiTenancyConfig["accessControl"]>,
      "controlPlaneTenantId"
    >;
  };

  /**
   * Entity hooks configuration.
   * Resource server and tenant hooks will be merged with the sync hooks.
   */
  entityHooks?: AuthHeroConfig["entityHooks"];

  /**
   * Additional routes to mount on the management API.
   * Note: The tenant CRUD routes are automatically added by multi-tenancy.
   */
  managementApiExtensions?: ManagementApiExtension[];
}

/**
 * Initializes a multi-tenant AuthHero server.
 *
 * This wraps the standard AuthHero `init()` function and adds:
 * - Tenant CRUD routes (list, create, update, delete) at /api/v2/tenants
 * - Resource server synchronization from control plane to child tenants
 * - Tenant creation hooks to copy resource servers to new tenants
 *
 * @param config - Multi-tenant AuthHero configuration
 * @returns AuthHero app instance with multi-tenancy features
 *
 * @example
 * ```typescript
 * import { init } from "@authhero/multi-tenancy";
 * import createAdapters from "@authhero/kysely-adapter";
 *
 * const dataAdapter = createAdapters(db);
 *
 * const { app } = init({
 *   dataAdapter,
 *   controlPlaneTenantId: "control_plane",
 *   sync: { resourceServers: true, roles: true, connections: true },
 * });
 *
 * export default app;
 * ```
 */
export function init(config: MultiTenantAuthHeroConfig) {
  const {
    controlPlaneTenantId = "control_plane",
    sync: syncOptions,
    multiTenancy: multiTenancyOptions,
    entityHooks: configEntityHooks,
    ...authHeroConfig
  } = config;

  // Build the multi-tenancy config
  const multiTenancyConfig: MultiTenancyConfig = {
    ...multiTenancyOptions,
    accessControl: {
      controlPlaneTenantId,
      requireOrganizationMatch: false,
      defaultPermissions: ["tenant:admin"],
      ...multiTenancyOptions?.accessControl,
    },
  };

  // Create multi-tenancy hooks
  const multiTenancyHooks = createMultiTenancyHooks(multiTenancyConfig);

  // Determine how to get adapters for a tenant
  // If database isolation is configured, use the tenant-specific adapter factory
  // Otherwise, use the shared data adapter for all tenants
  const getAdaptersForTenant =
    multiTenancyOptions?.databaseIsolation?.getAdapters ??
    (async () => config.dataAdapter);

  // Create unified sync hooks
  const { entityHooks: syncEntityHooks, tenantHooks: syncTenantHooks } =
    createSyncHooks({
      controlPlaneTenantId,
      getChildTenantIds: async () => {
        const allTenants = await fetchAll<{ id: string }>(
          (params) => config.dataAdapter.tenants.list(params),
          "tenants",
          { cursorField: "id", pageSize: 100 },
        );
        return allTenants
          .filter((t) => t.id !== controlPlaneTenantId)
          .map((t) => t.id);
      },
      getAdapters: getAdaptersForTenant,
      getControlPlaneAdapters: async () =>
        getAdaptersForTenant(controlPlaneTenantId),
      sync: syncOptions,
    });

  // Helper to chain two hooks of the same type
  function chainHook<TArgs extends unknown[]>(
    hook1: ((...args: TArgs) => Promise<void>) | undefined,
    hook2: ((...args: TArgs) => Promise<void>) | undefined,
  ): ((...args: TArgs) => Promise<void>) | undefined {
    if (!hook1 && !hook2) return undefined;
    if (!hook1) return hook2;
    if (!hook2) return hook1;
    return async (...args: TArgs) => {
      const errors: Error[] = [];
      for (const hook of [hook1, hook2]) {
        try {
          await hook(...args);
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)));
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          errors.map((e) => e.message).join("; "),
        );
    };
  }

  // Merge entity hooks using chainHook for each hook type
  const mergedEntityHooks: AuthHeroConfig["entityHooks"] = {
    ...configEntityHooks,
    resourceServers: syncEntityHooks?.resourceServers
      ? {
          ...configEntityHooks?.resourceServers,
          afterCreate: chainHook(
            configEntityHooks?.resourceServers?.afterCreate,
            syncEntityHooks.resourceServers.afterCreate,
          ),
          afterUpdate: chainHook(
            configEntityHooks?.resourceServers?.afterUpdate,
            syncEntityHooks.resourceServers.afterUpdate,
          ),
          beforeDelete: chainHook(
            configEntityHooks?.resourceServers?.beforeDelete,
            syncEntityHooks.resourceServers.beforeDelete,
          ),
          afterDelete: chainHook(
            configEntityHooks?.resourceServers?.afterDelete,
            syncEntityHooks.resourceServers.afterDelete,
          ),
        }
      : configEntityHooks?.resourceServers,
    roles: syncEntityHooks?.roles
      ? {
          ...configEntityHooks?.roles,
          afterCreate: chainHook(
            configEntityHooks?.roles?.afterCreate,
            syncEntityHooks.roles.afterCreate,
          ),
          afterUpdate: chainHook(
            configEntityHooks?.roles?.afterUpdate,
            syncEntityHooks.roles.afterUpdate,
          ),
          beforeDelete: chainHook(
            configEntityHooks?.roles?.beforeDelete,
            syncEntityHooks.roles.beforeDelete,
          ),
          afterDelete: chainHook(
            configEntityHooks?.roles?.afterDelete,
            syncEntityHooks.roles.afterDelete,
          ),
        }
      : configEntityHooks?.roles,
    connections: syncEntityHooks?.connections
      ? {
          ...configEntityHooks?.connections,
          afterCreate: chainHook(
            configEntityHooks?.connections?.afterCreate,
            syncEntityHooks.connections.afterCreate,
          ),
          afterUpdate: chainHook(
            configEntityHooks?.connections?.afterUpdate,
            syncEntityHooks.connections.afterUpdate,
          ),
          beforeDelete: chainHook(
            configEntityHooks?.connections?.beforeDelete,
            syncEntityHooks.connections.beforeDelete,
          ),
          afterDelete: chainHook(
            configEntityHooks?.connections?.afterDelete,
            syncEntityHooks.connections.afterDelete,
          ),
        }
      : configEntityHooks?.connections,
    // Note: tenant sync hooks are only attached to combinedTenantHooks (for router use)
    // to avoid duplicate execution. The entityHooks.tenants doesn't need the sync hook.
    tenants: configEntityHooks?.tenants,
  };

  // Create combined tenant hooks for the router
  // This is where sync hooks are attached for tenant creation
  const combinedTenantHooks: MultiTenancyHooks = {
    ...multiTenancyHooks,
    tenants: syncTenantHooks
      ? {
          ...multiTenancyHooks.tenants,
          afterCreate: chainHook(
            multiTenancyHooks.tenants?.afterCreate,
            syncTenantHooks.afterCreate,
          ),
        }
      : multiTenancyHooks.tenants,
  };

  // Create the OpenAPI tenant routes
  const tenantsOpenAPIRouter = createTenantsOpenAPIRouter(
    multiTenancyConfig,
    combinedTenantHooks,
  );

  // Initialize AuthHero with merged config, including tenant route extensions
  const authHeroResult = initAuthHero({
    ...authHeroConfig,
    entityHooks: mergedEntityHooks,
    managementApiExtensions: [
      ...(authHeroConfig.managementApiExtensions || []),
      { path: "/tenants", router: tenantsOpenAPIRouter },
    ],
  });

  const { app: authHeroApp, managementApp, ...rest } = authHeroResult;

  // Create a wrapper app with error handling and middleware
  const app = new Hono<{
    Bindings: MultiTenancyBindings;
    Variables: MultiTenancyVariables;
  }>();

  app.onError((err, ctx) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    console.error(err);
    return ctx.json({ message: "Internal Server Error" }, 500);
  });

  app.use("/api/v2/*", createProtectSyncedMiddleware());
  app.route("/", authHeroApp);

  return {
    app,
    managementApp,
    ...rest,
    multiTenancyConfig,
    multiTenancyHooks,
  };
}
