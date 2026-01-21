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
import { createTenantsOpenAPIRouter } from "./routes";
import {
  createMultiTenancyMiddleware,
  withRuntimeFallback,
} from "./middleware";

// Re-export all multi-tenancy types
export * from "./types";

// Main entry point - the simplest way to set up multi-tenancy
export { initMultiTenant } from "./init";
export type {
  MultiTenantConfig,
  MultiTenantResult,
  ControlPlaneConfig,
} from "./init";

// Public API - functions and types consumers actually need
export { createSyncHooks } from "./hooks/sync";
export type { EntitySyncConfig, SyncHooksResult } from "./hooks/sync";

export { createTenantsOpenAPIRouter } from "./routes";

export {
  createMultiTenancyMiddleware,
  createAccessControlMiddleware,
  createControlPlaneTenantMiddleware,
  createSubdomainMiddleware,
  createDatabaseMiddleware,
  createProtectSyncedMiddleware,
  createRuntimeFallbackAdapter,
  withRuntimeFallback,
} from "./middleware";
export type { RuntimeFallbackConfig } from "./middleware";

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
 * @returns Object with hooks, middleware, routes, and wrapAdapters helper
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
 * // Wrap your adapters with runtime fallback (uses same controlPlaneTenantId)
 * const dataAdapter = multiTenancy.wrapAdapters(baseAdapters, {
 *   controlPlaneClientId: "default_client", // optional additional config
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
    /**
     * Wraps data adapters with runtime fallback from the control plane.
     * Uses the controlPlaneTenantId from the multi-tenancy config.
     *
     * @param adapters - Base data adapters to wrap
     * @param additionalConfig - Additional config (controlPlaneClientId, etc.)
     * @returns Wrapped adapters with runtime fallback
     */
    wrapAdapters: (
      adapters: import("authhero").DataAdapters,
      additionalConfig?: { controlPlaneClientId?: string },
    ) =>
      withRuntimeFallback(adapters, {
        controlPlaneTenantId: config.accessControl?.controlPlaneTenantId,
        controlPlaneClientId: additionalConfig?.controlPlaneClientId,
      }),
  };
}
