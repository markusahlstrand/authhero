import { Hono } from "hono";
import { init as initAuthHero, AuthHeroConfig } from "authhero";
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
import { createTenantsRouter } from "./routes";
import {
  createMultiTenancyMiddleware,
  createProtectSyncedMiddleware,
} from "./middleware";
import {
  createResourceServerSyncHooks,
  createTenantResourceServerSyncHooks,
} from "./hooks/resource-server-sync";
import { fetchAll } from "./utils/fetchAll";

// Re-export essential types and functions from authhero
export { seed } from "authhero";
export type {
  AuthHeroConfig,
  DataAdapters,
  Tenant,
  CreateTenantParams,
  ResourceServer,
} from "authhero";

// Re-export all types
export * from "./types";

// Re-export hooks
export {
  createAccessControlHooks,
  createDatabaseHooks,
  createProvisioningHooks,
  createResourceServerSyncHooks,
  createTenantResourceServerSyncHooks,
} from "./hooks";

export { validateTenantAccess } from "./hooks/access-control";
export type { DatabaseFactory } from "./hooks/database";
export type {
  ResourceServerSyncConfig,
  ResourceServerEntityHooks,
  TenantResourceServerSyncConfig,
} from "./hooks/resource-server-sync";

// Re-export routes
export { createTenantsRouter } from "./routes";

// Re-export middleware
export {
  createMultiTenancyMiddleware,
  createAccessControlMiddleware,
  createSubdomainMiddleware,
  createDatabaseMiddleware,
  createProtectSyncedMiddleware,
} from "./middleware";

// Re-export utils
export { fetchAll } from "./utils/fetchAll";
export type { FetchAllOptions } from "./utils/fetchAll";

// Re-export plugin
export { createMultiTenancyPlugin } from "./plugin";
export type { AuthHeroPlugin } from "./plugin";

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
 *     mainTenantId: "main",
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
 *     mainTenantId: "main",
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
  app.route("/tenants", createTenantsRouter(config, hooks));

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
 *     mainTenantId: "main",
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
export interface MultiTenantAuthHeroConfig
  extends Omit<AuthHeroConfig, "entityHooks"> {
  /**
   * The main tenant ID that manages all other tenants.
   * This tenant can create, update, and delete other tenants.
   * @default "main"
   */
  mainTenantId?: string;

  /**
   * Whether to sync resource servers from the main tenant to child tenants.
   * When enabled, resource servers created on the main tenant are automatically
   * copied to all other tenants.
   * @default true
   */
  syncResourceServers?: boolean;

  /**
   * Additional multi-tenancy configuration options.
   */
  multiTenancy?: Omit<MultiTenancyConfig, "accessControl"> & {
    accessControl?: Omit<
      NonNullable<MultiTenancyConfig["accessControl"]>,
      "mainTenantId"
    >;
  };

  /**
   * Entity hooks configuration.
   * Resource server and tenant hooks will be merged with the sync hooks.
   */
  entityHooks?: AuthHeroConfig["entityHooks"];
}

/**
 * Initializes a multi-tenant AuthHero server.
 *
 * This wraps the standard AuthHero `init()` function and adds:
 * - Tenant CRUD routes (list, create, update, delete) at /api/v2/tenants
 * - Resource server synchronization from main tenant to child tenants
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
 *   mainTenantId: "main",
 *   syncResourceServers: true,
 * });
 *
 * export default app;
 * ```
 */
export function init(config: MultiTenantAuthHeroConfig) {
  const {
    mainTenantId = "main",
    syncResourceServers = true,
    multiTenancy: multiTenancyOptions,
    entityHooks: configEntityHooks,
    ...authHeroConfig
  } = config;

  // Build the multi-tenancy config
  const multiTenancyConfig: MultiTenancyConfig = {
    ...multiTenancyOptions,
    accessControl: {
      mainTenantId,
      requireOrganizationMatch: false,
      defaultPermissions: ["tenant:admin"],
      ...multiTenancyOptions?.accessControl,
    },
  };

  // Create multi-tenancy hooks
  const multiTenancyHooks = createMultiTenancyHooks(multiTenancyConfig);

  // Create resource server sync hooks if enabled
  let resourceServerHooks:
    | ReturnType<typeof createResourceServerSyncHooks>
    | undefined;
  let tenantResourceServerHooks:
    | ReturnType<typeof createTenantResourceServerSyncHooks>
    | undefined;

  if (syncResourceServers) {
    resourceServerHooks = createResourceServerSyncHooks({
      mainTenantId,
      getChildTenantIds: async () => {
        const allTenants = await fetchAll<{ id: string }>(
          (params) => config.dataAdapter.tenants.list(params),
          "tenants",
          { cursorField: "id", pageSize: 100 },
        );
        return allTenants
          .filter((t) => t.id !== mainTenantId)
          .map((t) => t.id);
      },
      getAdapters: async () => config.dataAdapter,
    });

    tenantResourceServerHooks = createTenantResourceServerSyncHooks({
      mainTenantId,
      getMainTenantAdapters: async () => config.dataAdapter,
      getAdapters: async () => config.dataAdapter,
    });
  }

  // Merge entity hooks
  const mergedEntityHooks: AuthHeroConfig["entityHooks"] = {
    ...configEntityHooks,
    resourceServers: resourceServerHooks
      ? {
          ...configEntityHooks?.resourceServers,
          afterCreate: async (ctx, entity) => {
            await configEntityHooks?.resourceServers?.afterCreate?.(
              ctx,
              entity,
            );
            await resourceServerHooks?.afterCreate?.(ctx, entity);
          },
          afterUpdate: async (ctx, id, entity) => {
            await configEntityHooks?.resourceServers?.afterUpdate?.(
              ctx,
              id,
              entity,
            );
            await resourceServerHooks?.afterUpdate?.(ctx, id, entity);
          },
          afterDelete: async (ctx, id) => {
            await configEntityHooks?.resourceServers?.afterDelete?.(ctx, id);
            await resourceServerHooks?.afterDelete?.(ctx, id);
          },
        }
      : configEntityHooks?.resourceServers,
    tenants: tenantResourceServerHooks
      ? {
          ...configEntityHooks?.tenants,
          afterCreate: async (ctx, entity) => {
            await configEntityHooks?.tenants?.afterCreate?.(ctx, entity);
            await tenantResourceServerHooks?.afterCreate?.(ctx, entity);
          },
        }
      : configEntityHooks?.tenants,
  };

  // Initialize AuthHero with merged config
  const authHeroResult = initAuthHero({
    ...authHeroConfig,
    entityHooks: mergedEntityHooks,
  });

  const { app, managementApp, ...rest } = authHeroResult;

  // Add middleware to protect synced resources from modification
  // This must be added before routes so it can intercept write operations
  app.use("/api/v2/*", createProtectSyncedMiddleware());

  // Create the tenant CRUD router
  const tenantsRouter = createTenantsRouter(
    multiTenancyConfig,
    multiTenancyHooks,
  );

  // Mount tenant CRUD routes directly on the main app at /api/v2/tenants
  // This adds routes like GET /, POST /, GET /:id, etc.
  // The authhero's /tenants/settings route is already mounted via managementApp
  app.route("/api/v2/tenants", tenantsRouter);

  return {
    app,
    managementApp,
    ...rest,
    multiTenancyConfig,
    multiTenancyHooks,
  };
}
