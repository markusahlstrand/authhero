import { Hono } from "hono";
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
import { createMultiTenancyMiddleware } from "./middleware";

// Re-export all types
export * from "./types";

// Re-export hooks
export {
  createAccessControlHooks,
  createDatabaseHooks,
  createProvisioningHooks,
} from "./hooks";

export { validateTenantAccess } from "./hooks/access-control";
export type { DatabaseFactory } from "./hooks/database";

// Re-export routes
export { createTenantsRouter } from "./routes";

// Re-export middleware
export {
  createMultiTenancyMiddleware,
  createAccessControlMiddleware,
  createSubdomainMiddleware,
  createDatabaseMiddleware,
} from "./middleware";

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
    onTenantCreated: provisioningHooks.onTenantCreated,
    onTenantDeleting: provisioningHooks.onTenantDeleting,
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
