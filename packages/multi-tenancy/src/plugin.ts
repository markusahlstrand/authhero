import { Hono, MiddlewareHandler } from "hono";
import {
  MultiTenancyConfig,
  MultiTenancyHooks,
  MultiTenancyBindings,
  MultiTenancyVariables,
} from "./types";
import { createMultiTenancyMiddleware } from "./middleware";
import { createMultiTenancyHooks } from "./index";
import { createTenantsRouter } from "./routes";

type MultiTenancyEnv = {
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
};

/**
 * Plugin interface for AuthHero extensions
 */
export interface AuthHeroPlugin {
  /**
   * Plugin name for identification
   */
  name: string;

  /**
   * Middleware to run before AuthHero routes
   */
  middleware?: MiddlewareHandler<MultiTenancyEnv>;

  /**
   * Lifecycle hooks
   */
  hooks?: MultiTenancyHooks;

  /**
   * Additional routes to mount
   */
  routes?: Array<{
    path: string;
    handler: Hono<MultiTenancyEnv>;
  }>;

  /**
   * Called when plugin is registered
   */
  onRegister?: (app: Hono) => void | Promise<void>;
}

/**
 * Creates a multi-tenancy plugin for AuthHero.
 *
 * This packages all multi-tenancy functionality (middleware, hooks, and routes)
 * into a single plugin that can be registered with AuthHero.
 *
 * @param config - Multi-tenancy configuration
 * @returns AuthHero plugin for multi-tenancy support
 *
 * @example
 * ```typescript
 * import { createAuthhero } from "@authhero/authhero";
 * import { createMultiTenancyPlugin } from "@authhero/multi-tenancy";
 *
 * const app = createAuthhero({
 *   plugins: [
 *     createMultiTenancyPlugin({
 *       accessControl: {
 *         controlPlaneTenantId: "main",
 *         defaultPermissions: ["tenant:admin"],
 *       },
 *       subdomainRouting: {
 *         baseDomain: "auth.example.com",
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function createMultiTenancyPlugin(
  config: MultiTenancyConfig,
): AuthHeroPlugin {
  const hooks = createMultiTenancyHooks(config);

  return {
    name: "multi-tenancy",

    // Apply multi-tenancy middleware for subdomain routing, database resolution, etc.
    middleware: createMultiTenancyMiddleware(config),

    // Provide lifecycle hooks
    hooks,

    // Mount tenant management routes
    routes: [
      {
        path: "/management",
        handler: createTenantsRouter(config, hooks),
      },
    ],

    // Called when plugin is registered
    onRegister: async () => {
      console.log("Multi-tenancy plugin registered");
      if (config.accessControl) {
        console.log(
          `  - Access control enabled (control plane: ${config.accessControl.controlPlaneTenantId})`,
        );
      }
      if (config.subdomainRouting) {
        console.log(
          `  - Subdomain routing enabled (base domain: ${config.subdomainRouting.baseDomain})`,
        );
      }
      if (config.databaseIsolation) {
        console.log("  - Database isolation enabled");
      }
    },
  };
}
