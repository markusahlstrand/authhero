import {
  DataAdapters,
  ResourceServer,
  ResourceServerInsert,
} from "@authhero/adapter-interfaces";
import { TenantEntityHooks, TenantHookContext } from "../types";
import { fetchAll } from "../utils/fetchAll";

/**
 * Configuration for resource server synchronization
 */
export interface ResourceServerSyncConfig {
  /**
   * The main tenant ID from which resource servers are synced
   */
  mainTenantId: string;

  /**
   * Function to get the list of all tenant IDs to sync to.
   * Called when a resource server is created/updated/deleted on the main tenant.
   */
  getChildTenantIds: () => Promise<string[]>;

  /**
   * Function to get adapters for a specific tenant.
   * Used to write resource servers to child tenants.
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /**
   * Optional: Filter function to determine if a resource server should be synced.
   * Return true to sync, false to skip.
   * @default All resource servers are synced
   */
  shouldSync?: (resourceServer: ResourceServer) => boolean;

  /**
   * Optional: Transform the resource server before syncing to child tenants.
   * Useful for modifying identifiers or removing sensitive data.
   */
  transformForSync?: (
    resourceServer: ResourceServer,
    targetTenantId: string,
  ) => ResourceServerInsert;
}

/**
 * Context passed to entity hooks
 */
interface EntityHookContext {
  tenantId: string;
  adapters: DataAdapters;
}

/**
 * Entity hooks for resource server CRUD operations
 */
export interface ResourceServerEntityHooks {
  afterCreate?: (
    ctx: EntityHookContext,
    entity: ResourceServer,
  ) => Promise<void>;
  afterUpdate?: (
    ctx: EntityHookContext,
    id: string,
    entity: ResourceServer,
  ) => Promise<void>;
  afterDelete?: (ctx: EntityHookContext, id: string) => Promise<void>;
}

/**
 * Creates entity hooks for syncing resource servers from the main tenant to all child tenants.
 *
 * When a resource server is created, updated, or deleted on the main tenant,
 * the change is automatically propagated to all child tenants.
 *
 * @param config - Resource server sync configuration
 * @returns Entity hooks for resource server synchronization
 *
 * @example
 * ```typescript
 * import { createResourceServerSyncHooks } from "@authhero/multi-tenancy";
 *
 * const resourceServerHooks = createResourceServerSyncHooks({
 *   mainTenantId: "main",
 *   getChildTenantIds: async () => {
 *     const tenants = await db.tenants.list();
 *     return tenants.filter(t => t.id !== "main").map(t => t.id);
 *   },
 *   getAdapters: async (tenantId) => {
 *     return createAdaptersForTenant(tenantId);
 *   },
 * });
 *
 * // Use with AuthHero config
 * const config: AuthHeroConfig = {
 *   dataAdapter,
 *   entityHooks: {
 *     resourceServers: resourceServerHooks,
 *   },
 * };
 * ```
 */
export function createResourceServerSyncHooks(
  config: ResourceServerSyncConfig,
): ResourceServerEntityHooks {
  const {
    mainTenantId,
    getChildTenantIds,
    getAdapters,
    shouldSync = () => true,
    transformForSync,
  } = config;

  /**
   * Find a resource server by identifier using list query
   */
  async function findByIdentifier(
    adapters: DataAdapters,
    tenantId: string,
    identifier: string,
  ): Promise<ResourceServer | null> {
    const result = await adapters.resourceServers.list(tenantId, {
      q: `identifier:${identifier}`,
      per_page: 1,
    });
    return result.resource_servers[0] ?? null;
  }

  /**
   * Sync a resource server to all child tenants
   */
  async function syncToChildTenants(
    resourceServer: ResourceServer,
    operation: "create" | "update",
  ): Promise<void> {
    const childTenantIds = await getChildTenantIds();

    await Promise.all(
      childTenantIds.map(async (tenantId) => {
        try {
          const adapters = await getAdapters(tenantId);

          // Transform if needed
          const dataToSync: ResourceServerInsert = transformForSync
            ? transformForSync(resourceServer, tenantId)
            : {
                name: resourceServer.name,
                identifier: resourceServer.identifier,
                scopes: resourceServer.scopes,
                signing_alg: resourceServer.signing_alg,
                signing_secret: resourceServer.signing_secret,
                token_lifetime: resourceServer.token_lifetime,
                token_lifetime_for_web: resourceServer.token_lifetime_for_web,
                skip_consent_for_verifiable_first_party_clients:
                  resourceServer.skip_consent_for_verifiable_first_party_clients,
                allow_offline_access: resourceServer.allow_offline_access,
                verificationKey: resourceServer.verificationKey,
                options: resourceServer.options,
              };

          // Add is_system flag to mark this as synced from main tenant
          const dataWithIsSystem = { ...dataToSync, is_system: true };

          if (operation === "create") {
            // Check if already exists (by identifier)
            const existing = await findByIdentifier(
              adapters,
              tenantId,
              resourceServer.identifier,
            );

            if (existing && existing.id) {
              // Update existing using its ID
              await adapters.resourceServers.update(
                tenantId,
                existing.id,
                dataWithIsSystem,
              );
            } else {
              // Create new
              await adapters.resourceServers.create(tenantId, dataWithIsSystem);
            }
          } else {
            // Update - find by identifier first to get the ID
            const existing = await findByIdentifier(
              adapters,
              tenantId,
              resourceServer.identifier,
            );

            if (existing && existing.id) {
              await adapters.resourceServers.update(
                tenantId,
                existing.id,
                dataWithIsSystem,
              );
            }
          }
        } catch (error) {
          console.error(
            `Failed to sync resource server "${resourceServer.identifier}" to tenant "${tenantId}":`,
            error,
          );
          // Continue syncing to other tenants even if one fails
        }
      }),
    );
  }

  /**
   * Delete a resource server from all child tenants by identifier
   */
  async function deleteFromChildTenants(identifier: string): Promise<void> {
    const childTenantIds = await getChildTenantIds();

    await Promise.all(
      childTenantIds.map(async (tenantId) => {
        try {
          const adapters = await getAdapters(tenantId);

          // Find by identifier first to get the ID
          const existing = await findByIdentifier(
            adapters,
            tenantId,
            identifier,
          );

          if (existing && existing.id) {
            await adapters.resourceServers.remove(tenantId, existing.id);
          }
        } catch (error) {
          console.error(
            `Failed to delete resource server "${identifier}" from tenant "${tenantId}":`,
            error,
          );
          // Continue deleting from other tenants even if one fails
        }
      }),
    );
  }

  return {
    afterCreate: async (
      ctx: EntityHookContext,
      resourceServer: ResourceServer,
    ) => {
      // Only sync if this is from the main tenant
      if (ctx.tenantId !== mainTenantId) {
        return;
      }

      // Check if this resource server should be synced
      if (!shouldSync(resourceServer)) {
        return;
      }

      await syncToChildTenants(resourceServer, "create");
    },

    afterUpdate: async (
      ctx: EntityHookContext,
      _id: string,
      resourceServer: ResourceServer,
    ) => {
      // Only sync if this is from the main tenant
      if (ctx.tenantId !== mainTenantId) {
        return;
      }

      // Check if this resource server should be synced
      if (!shouldSync(resourceServer)) {
        return;
      }

      await syncToChildTenants(resourceServer, "update");
    },

    afterDelete: async (ctx: EntityHookContext, id: string) => {
      // Only sync if this is from the main tenant
      if (ctx.tenantId !== mainTenantId) {
        return;
      }

      // id is the identifier of the resource server
      await deleteFromChildTenants(id);
    },
  };
}

/**
 * Configuration for syncing resource servers to new tenants
 */
export interface TenantResourceServerSyncConfig {
  /**
   * The main tenant ID from which resource servers are copied
   */
  mainTenantId: string;

  /**
   * Function to get adapters for the main tenant.
   * Used to read existing resource servers.
   */
  getMainTenantAdapters: () => Promise<DataAdapters>;

  /**
   * Function to get adapters for the new tenant.
   * Used to write resource servers to the new tenant.
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /**
   * Optional: Filter function to determine if a resource server should be synced.
   * Return true to sync, false to skip.
   * @default All resource servers are synced
   */
  shouldSync?: (resourceServer: ResourceServer) => boolean;

  /**
   * Optional: Transform the resource server before syncing to the new tenant.
   * Useful for modifying identifiers or removing sensitive data.
   */
  transformForSync?: (
    resourceServer: ResourceServer,
    targetTenantId: string,
  ) => ResourceServerInsert;
}

/**
 * Creates a tenant afterCreate hook that copies all resource servers from the main tenant
 * to a newly created tenant.
 *
 * This should be used with the MultiTenancyHooks.tenants.afterCreate hook.
 *
 * @param config - Configuration for tenant resource server sync
 * @returns A TenantEntityHooks object with afterCreate implemented
 *
 * @example
 * ```typescript
 * import { createTenantResourceServerSyncHooks } from "@authhero/multi-tenancy";
 *
 * const resourceServerSyncHooks = createTenantResourceServerSyncHooks({
 *   mainTenantId: "main",
 *   getMainTenantAdapters: async () => mainAdapters,
 *   getAdapters: async (tenantId) => createAdaptersForTenant(tenantId),
 * });
 *
 * const multiTenancyHooks: MultiTenancyHooks = {
 *   tenants: {
 *     afterCreate: resourceServerSyncHooks.afterCreate,
 *   },
 * };
 * ```
 */
export function createTenantResourceServerSyncHooks(
  config: TenantResourceServerSyncConfig,
): TenantEntityHooks {
  const {
    mainTenantId,
    getMainTenantAdapters,
    getAdapters,
    shouldSync = () => true,
    transformForSync,
  } = config;

  return {
    async afterCreate(
      _ctx: TenantHookContext,
      tenant: { id: string },
    ): Promise<void> {
      // Don't sync to the main tenant itself
      if (tenant.id === mainTenantId) {
        return;
      }

      try {
        const mainAdapters = await getMainTenantAdapters();
        const targetAdapters = await getAdapters(tenant.id);

        // Get all resource servers from main tenant using pagination
        const allResourceServers = await fetchAll<ResourceServer>(
          (params) => mainAdapters.resourceServers.list(mainTenantId, params),
          "resource_servers",
          { cursorField: "id", pageSize: 100 },
        );

        // Sync each resource server to the new tenant
        await Promise.all(
          allResourceServers
            .filter((rs) => shouldSync(rs as ResourceServer))
            .map(async (rs) => {
              const resourceServer = rs as ResourceServer;
              try {
                const dataToSync: ResourceServerInsert = transformForSync
                  ? transformForSync(resourceServer, tenant.id)
                  : {
                      name: resourceServer.name,
                      identifier: resourceServer.identifier,
                      scopes: resourceServer.scopes,
                      signing_alg: resourceServer.signing_alg,
                      signing_secret: resourceServer.signing_secret,
                      token_lifetime: resourceServer.token_lifetime,
                      token_lifetime_for_web:
                        resourceServer.token_lifetime_for_web,
                      skip_consent_for_verifiable_first_party_clients:
                        resourceServer.skip_consent_for_verifiable_first_party_clients,
                      allow_offline_access: resourceServer.allow_offline_access,
                      verificationKey: resourceServer.verificationKey,
                      options: resourceServer.options,
                    };

                // Add is_system flag to mark this as synced from main tenant
                await targetAdapters.resourceServers.create(tenant.id, {
                  ...dataToSync,
                  is_system: true,
                });
              } catch (error) {
                console.error(
                  `Failed to sync resource server "${resourceServer.identifier}" to new tenant "${tenant.id}":`,
                  error,
                );
              }
            }),
        );
      } catch (error) {
        console.error(
          `Failed to sync resource servers to new tenant "${tenant.id}":`,
          error,
        );
      }
    },
  };
}
