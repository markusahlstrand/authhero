import { DataAdapters } from "@authhero/adapter-interfaces";
import {
  createMainTenantAdapter,
  MainTenantAdapterConfig,
} from "./main-tenant-adapter";

/**
 * Helper function to wrap data adapters with main tenant fallback functionality.
 * This should be used when initializing the AuthHero application to enable
 * fallback to a main tenant for default configurations.
 *
 * @param baseAdapters - The base data adapters to wrap
 * @param config - Configuration for main tenant fallback
 * @returns Wrapped data adapters with main tenant fallback functionality
 *
 * @example
 * ```typescript
 * import { init, withMainTenantFallback } from "@authhero/authhero";
 * import createAdapters from "@authhero/kysely";
 *
 * const db = // ... your database connection
 * const baseAdapters = createAdapters(db);
 *
 * const adapters = withMainTenantFallback(baseAdapters, {
 *   mainTenantId: "main",
 *   mainClientId: "main-client"
 * });
 *
 * const app = init({ dataAdapter: adapters });
 * ```
 */
export function withMainTenantFallback(
  baseAdapters: DataAdapters,
  config: MainTenantAdapterConfig,
): DataAdapters {
  return createMainTenantAdapter(baseAdapters, config);
}

// Export cache adapters
export * from "./cache";
