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
 * @deprecated Use `withSettingsInheritance` or `createSettingsInheritanceAdapter`
 * from `@authhero/multi-tenancy` instead. This function will be removed in a future version.
 *
 * @param baseAdapters - The base data adapters to wrap
 * @param config - Configuration for main tenant fallback
 * @returns Wrapped data adapters with main tenant fallback functionality
 *
 * @example
 * ```typescript
 * // Old way (deprecated):
 * import { init, withMainTenantFallback } from "@authhero/authhero";
 *
 * // New way:
 * import { withSettingsInheritance } from "@authhero/multi-tenancy";
 * const adapters = withSettingsInheritance(baseAdapters, {
 *   controlPlaneTenantId: "main",
 *   controlPlaneClientId: "main-client"
 * });
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
