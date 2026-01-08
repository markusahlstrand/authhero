import { DataAdapters } from "authhero";
import { DatabaseIsolationConfig, MultiTenancyHooks } from "../types";

/**
 * Creates hooks for per-tenant database resolution.
 *
 * This enables scenarios where each tenant has its own database instance,
 * providing complete data isolation.
 *
 * @param config - Database isolation configuration
 * @returns Hooks for database resolution
 */
export function createDatabaseHooks(
  config: DatabaseIsolationConfig,
): Pick<MultiTenancyHooks, "resolveDataAdapters"> {
  return {
    async resolveDataAdapters(
      tenantId: string,
    ): Promise<DataAdapters | undefined> {
      try {
        return await config.getAdapters(tenantId);
      } catch (error) {
        console.error(
          `Failed to resolve data adapters for tenant ${tenantId}:`,
          error,
        );
        return undefined;
      }
    },
  };
}

/**
 * Database factory interface for creating tenant-specific database adapters.
 *
 * Implementations of this interface should live in the respective adapter packages:
 * - D1: @authhero/cloudflare
 * - Turso: @authhero/turso (or similar)
 * - Custom: Implement your own
 */
export interface DatabaseFactory {
  /**
   * Get or create a database adapter for a tenant.
   */
  getAdapters(tenantId: string): Promise<DataAdapters>;

  /**
   * Provision a new database for a tenant.
   */
  provision(tenantId: string): Promise<void>;

  /**
   * Deprovision (delete) a tenant's database.
   */
  deprovision(tenantId: string): Promise<void>;
}
