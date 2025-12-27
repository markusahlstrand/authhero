import { Hono } from "hono";
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
import { createTenantsRouter, createTenantsOpenAPIRouter } from "./routes";
import {
  createMultiTenancyMiddleware,
  createProtectSyncedMiddleware,
} from "./middleware";
import {
  createResourceServerSyncHooks,
  createTenantResourceServerSyncHooks,
} from "./hooks/resource-server-sync";
import {
  createRoleSyncHooks,
  createTenantRoleSyncHooks,
} from "./hooks/role-sync";
import { fetchAll } from "./utils/fetchAll";

// Re-export essential types and functions from authhero
export { seed, MANAGEMENT_API_SCOPES } from "authhero";
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
  createRoleSyncHooks,
  createTenantRoleSyncHooks,
} from "./hooks";

export { validateTenantAccess } from "./hooks/access-control";
export type { DatabaseFactory } from "./hooks/database";
export type {
  ResourceServerSyncConfig,
  ResourceServerEntityHooks,
  TenantResourceServerSyncConfig,
} from "./hooks/resource-server-sync";
export type {
  RoleSyncConfig,
  RoleEntityHooks,
  TenantRoleSyncConfig,
} from "./hooks/role-sync";

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
  extends Omit<AuthHeroConfig, "entityHooks" | "managementApiExtensions"> {
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
   * Whether to sync roles from the main tenant to child tenants.
   * When enabled, roles created on the main tenant are automatically
   * copied to all other tenants (including their permissions).
   * @default true
   */
  syncRoles?: boolean;

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
    syncRoles = true,
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
        return allTenants.filter((t) => t.id !== mainTenantId).map((t) => t.id);
      },
      getAdapters: async (_tenantId: string) => config.dataAdapter,
    });

    tenantResourceServerHooks = createTenantResourceServerSyncHooks({
      mainTenantId,
      getMainTenantAdapters: async () => config.dataAdapter,
      getAdapters: async (_tenantId: string) => config.dataAdapter,
    });
  }

  // Create role sync hooks if enabled
  let roleHooks: ReturnType<typeof createRoleSyncHooks> | undefined;
  let tenantRoleHooks: ReturnType<typeof createTenantRoleSyncHooks> | undefined;

  if (syncRoles) {
    roleHooks = createRoleSyncHooks({
      mainTenantId,
      getChildTenantIds: async () => {
        const allTenants = await fetchAll<{ id: string }>(
          (params) => config.dataAdapter.tenants.list(params),
          "tenants",
          { cursorField: "id", pageSize: 100 },
        );
        return allTenants.filter((t) => t.id !== mainTenantId).map((t) => t.id);
      },
      getAdapters: async (_tenantId: string) => config.dataAdapter,
    });

    tenantRoleHooks = createTenantRoleSyncHooks({
      mainTenantId,
      getMainTenantAdapters: async () => config.dataAdapter,
      getAdapters: async (_tenantId: string) => config.dataAdapter,
      syncPermissions: true,
    });
  }

  // Helper to chain hooks with error handling - ensures both hooks execute
  // even if the first one throws, then re-throws any errors that occurred
  const chainHooks = async <T extends unknown[]>(
    hook1: ((...args: T) => Promise<void>) | undefined,
    hook2: ((...args: T) => Promise<void>) | undefined,
    ...args: T
  ): Promise<void> => {
    const errors: Error[] = [];

    if (hook1) {
      try {
        await hook1(...args);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (hook2) {
      try {
        await hook2(...args);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `Multiple hook errors: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
  };

  // Helper to chain multiple hooks with error handling
  const chainMultipleHooks = async <T extends unknown[]>(
    hooks: (((...args: T) => Promise<void>) | undefined)[],
    ...args: T
  ): Promise<void> => {
    const errors: Error[] = [];

    for (const hook of hooks) {
      if (hook) {
        try {
          await hook(...args);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `Multiple hook errors: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
  };

  // Merge entity hooks
  const mergedEntityHooks: AuthHeroConfig["entityHooks"] = {
    ...configEntityHooks,
    resourceServers: resourceServerHooks
      ? {
          ...configEntityHooks?.resourceServers,
          afterCreate: async (ctx, entity) => {
            await chainHooks(
              configEntityHooks?.resourceServers?.afterCreate,
              resourceServerHooks?.afterCreate,
              ctx,
              entity,
            );
          },
          afterUpdate: async (ctx, id, entity) => {
            await chainHooks(
              configEntityHooks?.resourceServers?.afterUpdate,
              resourceServerHooks?.afterUpdate,
              ctx,
              id,
              entity,
            );
          },
          afterDelete: async (ctx, id) => {
            await chainHooks(
              configEntityHooks?.resourceServers?.afterDelete,
              resourceServerHooks?.afterDelete,
              ctx,
              id,
            );
          },
        }
      : configEntityHooks?.resourceServers,
    roles: roleHooks
      ? {
          ...configEntityHooks?.roles,
          afterCreate: async (ctx, entity) => {
            await chainHooks(
              configEntityHooks?.roles?.afterCreate,
              roleHooks?.afterCreate,
              ctx,
              entity,
            );
          },
          afterUpdate: async (ctx, id, entity) => {
            await chainHooks(
              configEntityHooks?.roles?.afterUpdate,
              roleHooks?.afterUpdate,
              ctx,
              id,
              entity,
            );
          },
          afterDelete: async (ctx, id) => {
            await chainHooks(
              configEntityHooks?.roles?.afterDelete,
              roleHooks?.afterDelete,
              ctx,
              id,
            );
          },
        }
      : configEntityHooks?.roles,
    tenants:
      tenantResourceServerHooks || tenantRoleHooks
        ? {
            ...configEntityHooks?.tenants,
            afterCreate: async (ctx, entity) => {
              await chainMultipleHooks(
                [
                  configEntityHooks?.tenants?.afterCreate,
                  tenantResourceServerHooks?.afterCreate,
                  tenantRoleHooks?.afterCreate,
                ],
                ctx,
                entity,
              );
            },
          }
        : configEntityHooks?.tenants,
  };

  // Create combined tenant hooks for the router that include both provisioning and sync hooks
  // The router needs these hooks to be called when creating tenants via the API
  const combinedTenantHooks: MultiTenancyHooks = {
    ...multiTenancyHooks,
    tenants:
      tenantResourceServerHooks || tenantRoleHooks
        ? {
            ...multiTenancyHooks.tenants,
            afterCreate: async (ctx, entity) => {
              // First run the provisioning hooks (creates organization, etc.)
              if (multiTenancyHooks.tenants?.afterCreate) {
                await multiTenancyHooks.tenants.afterCreate(ctx, entity);
              }
              // Then run the sync hooks (syncs resource servers and roles)
              await chainMultipleHooks(
                [
                  tenantResourceServerHooks?.afterCreate,
                  tenantRoleHooks?.afterCreate,
                ],
                ctx,
                entity,
              );
            },
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
    // Register tenant routes via the extension mechanism
    // This ensures they go through the full middleware chain (caching, tenant, auth, entity hooks)
    managementApiExtensions: [
      ...(authHeroConfig.managementApiExtensions || []),
      { path: "/tenants", router: tenantsOpenAPIRouter },
    ],
  });

  const { app: authHeroApp, managementApp, ...rest } = authHeroResult;

  // Create a wrapper app to ensure middleware is registered before routes
  // In Hono, middleware only applies to routes defined AFTER the middleware is registered.
  // Since initAuthHero() already mounts routes internally, we need a wrapper app
  // where we can register middleware first, then mount the authHero routes.
  const app = new Hono<{
    Bindings: MultiTenancyBindings;
    Variables: MultiTenancyVariables;
  }>();

  // Add middleware to protect system resources from modification
  // This MUST be added before routes so it can intercept write operations
  app.use("/api/v2/*", createProtectSyncedMiddleware());

  // Mount all authHero routes on the wrapper app
  app.route("/", authHeroApp);

  return {
    app,
    managementApp,
    ...rest,
    multiTenancyConfig,
    multiTenancyHooks,
  };
}
