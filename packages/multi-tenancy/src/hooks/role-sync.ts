import { DataAdapters, Role, RoleInsert } from "@authhero/adapter-interfaces";
import { TenantEntityHooks, TenantHookContext } from "../types";
import { fetchAll } from "authhero";

/**
 * Configuration for role synchronization
 */
export interface RoleSyncConfig {
  /**
   * The control plane tenant ID from which roles are synced
   */
  controlPlaneTenantId: string;

  /**
   * Function to get the list of all tenant IDs to sync to.
   * Called when a role is created/updated/deleted on the control plane.
   */
  getChildTenantIds: () => Promise<string[]>;

  /**
   * Function to get adapters for a specific tenant.
   * Used to write roles to child tenants.
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /**
   * Optional: Filter function to determine if a role should be synced.
   * Return true to sync, false to skip.
   * @default All roles are synced
   */
  shouldSync?: (role: Role) => boolean;

  /**
   * Optional: Transform the role before syncing to child tenants.
   * Useful for modifying names or removing sensitive data.
   */
  transformForSync?: (role: Role, targetTenantId: string) => RoleInsert;
}

/**
 * Context passed to entity hooks
 */
interface EntityHookContext {
  tenantId: string;
  adapters: DataAdapters;
}

/**
 * Entity hooks for role CRUD operations
 */
export interface RoleEntityHooks {
  afterCreate?: (ctx: EntityHookContext, entity: Role) => Promise<void>;
  afterUpdate?: (
    ctx: EntityHookContext,
    id: string,
    entity: Role,
  ) => Promise<void>;
  afterDelete?: (ctx: EntityHookContext, id: string) => Promise<void>;
}

/**
 * Creates entity hooks for syncing roles from the control plane to all child tenants.
 *
 * When a role is created, updated, or deleted on the control plane,
 * the change is automatically propagated to all child tenants.
 *
 * @param config - Role sync configuration
 * @returns Entity hooks for role synchronization
 *
 * @example
 * ```typescript
 * import { createRoleSyncHooks } from "@authhero/multi-tenancy";
 *
 * const roleHooks = createRoleSyncHooks({
 *   controlPlaneTenantId: "main",
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
 *     roles: roleHooks,
 *   },
 * };
 * ```
 */
export function createRoleSyncHooks(config: RoleSyncConfig): RoleEntityHooks {
  const {
    controlPlaneTenantId,
    getChildTenantIds,
    getAdapters,
    shouldSync = () => true,
    transformForSync,
  } = config;

  /**
   * Find a role by name using list query
   */
  async function findByName(
    adapters: DataAdapters,
    tenantId: string,
    name: string,
  ): Promise<Role | null> {
    const result = await adapters.roles.list(tenantId, {
      q: `name:${name}`,
      per_page: 1,
    });
    return result.roles[0] ?? null;
  }

  /**
   * Sync a role to all child tenants
   */
  async function syncToChildTenants(
    role: Role,
    operation: "create" | "update",
  ): Promise<void> {
    const childTenantIds = await getChildTenantIds();

    await Promise.all(
      childTenantIds.map(async (tenantId) => {
        try {
          const adapters = await getAdapters(tenantId);

          // Transform if needed
          const dataToSync: RoleInsert = transformForSync
            ? transformForSync(role, tenantId)
            : {
                name: role.name,
                description: role.description,
              };

          // Add is_system flag to mark this as synced from control plane
          const dataWithIsSystem = { ...dataToSync, is_system: true };

          if (operation === "create") {
            // Check if already exists (by name)
            const existing = await findByName(adapters, tenantId, role.name);

            if (existing && existing.id) {
              // Update existing using its ID
              await adapters.roles.update(
                tenantId,
                existing.id,
                dataWithIsSystem,
              );
            } else {
              // Create new
              await adapters.roles.create(tenantId, dataWithIsSystem);
            }
          } else {
            // Update - find by name first to get the ID
            const existing = await findByName(adapters, tenantId, role.name);

            if (existing && existing.id) {
              await adapters.roles.update(
                tenantId,
                existing.id,
                dataWithIsSystem,
              );
            } else {
              // Create if it doesn't exist on the target tenant
              await adapters.roles.create(tenantId, dataWithIsSystem);
            }
          }
        } catch (error) {
          console.error(
            `Failed to sync role "${role.name}" to tenant "${tenantId}":`,
            error,
          );
          // Continue syncing to other tenants even if one fails
        }
      }),
    );
  }

  return {
    afterCreate: async (ctx: EntityHookContext, role: Role) => {
      // Only sync if this is from the control plane
      if (ctx.tenantId !== controlPlaneTenantId) {
        return;
      }

      // Check if this role should be synced
      if (!shouldSync(role)) {
        return;
      }

      await syncToChildTenants(role, "create");
    },

    afterUpdate: async (ctx: EntityHookContext, _id: string, role: Role) => {
      // Only sync if this is from the control plane
      if (ctx.tenantId !== controlPlaneTenantId) {
        return;
      }

      // Check if this role should be synced
      if (!shouldSync(role)) {
        return;
      }

      await syncToChildTenants(role, "update");
    },

    afterDelete: async (ctx: EntityHookContext, id: string) => {
      // Only sync if this is from the control plane
      if (ctx.tenantId !== controlPlaneTenantId) {
        return;
      }

      // For delete, we need to find the role name from the ID
      // Since the role is already deleted, we can't look it up
      // We'll need to delete by ID from child tenants
      // This is a limitation - we need to store the mapping somewhere
      // For now, we'll just log and skip
      console.warn(
        `Role ${id} was deleted from control plane. Child tenant roles with matching names should be deleted manually or implement role name tracking.`,
      );
    },
  };
}

/**
 * Configuration for syncing roles to new tenants
 */
export interface TenantRoleSyncConfig {
  /**
   * The control plane tenant ID from which roles are copied
   */
  controlPlaneTenantId: string;

  /**
   * Function to get adapters for the control plane.
   * Used to read existing roles.
   */
  getControlPlaneAdapters: () => Promise<DataAdapters>;

  /**
   * Function to get adapters for the new tenant.
   * Used to write roles to the new tenant.
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /**
   * Optional: Filter function to determine if a role should be synced.
   * Return true to sync, false to skip.
   * @default All roles are synced
   */
  shouldSync?: (role: Role) => boolean;

  /**
   * Optional: Transform the role before syncing to the new tenant.
   * Useful for modifying names or removing sensitive data.
   */
  transformForSync?: (role: Role, targetTenantId: string) => RoleInsert;

  /**
   * Whether to also sync role permissions (scopes from resource servers).
   * @default true
   */
  syncPermissions?: boolean;
}

/**
 * Creates a tenant afterCreate hook that copies all roles from the control plane
 * to a newly created tenant.
 *
 * This should be used with the MultiTenancyHooks.tenants.afterCreate hook.
 *
 * @param config - Configuration for tenant role sync
 * @returns A TenantEntityHooks object with afterCreate implemented
 *
 * @example
 * ```typescript
 * import { createTenantRoleSyncHooks } from "@authhero/multi-tenancy";
 *
 * const roleSyncHooks = createTenantRoleSyncHooks({
 *   controlPlaneTenantId: "main",
 *   getControlPlaneAdapters: async () => controlPlaneAdapters,
 *   getAdapters: async (tenantId) => createAdaptersForTenant(tenantId),
 * });
 *
 * const multiTenancyHooks: MultiTenancyHooks = {
 *   tenants: {
 *     afterCreate: roleSyncHooks.afterCreate,
 *   },
 * };
 * ```
 */
export function createTenantRoleSyncHooks(
  config: TenantRoleSyncConfig,
): TenantEntityHooks {
  const {
    controlPlaneTenantId,
    getControlPlaneAdapters,
    getAdapters,
    shouldSync = () => true,
    transformForSync,
    syncPermissions = true,
  } = config;

  return {
    async afterCreate(
      _ctx: TenantHookContext,
      tenant: { id: string },
    ): Promise<void> {
      // Don't sync to the control plane itself
      if (tenant.id === controlPlaneTenantId) {
        return;
      }

      try {
        const controlPlaneAdapters = await getControlPlaneAdapters();
        const targetAdapters = await getAdapters(tenant.id);

        // Get all roles from control plane using pagination
        const allRoles = await fetchAll<Role>(
          (params) =>
            controlPlaneAdapters.roles.list(controlPlaneTenantId, params),
          "roles",
          { cursorField: "id", pageSize: 100 },
        );

        // Create a mapping of control plane role IDs to new tenant role IDs
        const roleIdMapping = new Map<string, string>();

        // Sync each role to the new tenant
        await Promise.all(
          allRoles
            .filter((role) => shouldSync(role as Role))
            .map(async (r) => {
              const role = r as Role;
              try {
                const dataToSync: RoleInsert = transformForSync
                  ? transformForSync(role, tenant.id)
                  : {
                      name: role.name,
                      description: role.description,
                    };

                // Add is_system flag to mark this as synced from control plane
                const newRole = await targetAdapters.roles.create(tenant.id, {
                  ...dataToSync,
                  is_system: true,
                });

                // Store the mapping for permission sync
                roleIdMapping.set(role.id, newRole.id);
              } catch (error) {
                console.error(
                  `Failed to sync role "${role.name}" to new tenant "${tenant.id}":`,
                  error,
                );
              }
            }),
        );

        // Sync role permissions if enabled
        if (syncPermissions) {
          for (const [controlPlaneRoleId, newRoleId] of roleIdMapping) {
            try {
              // Get permissions for the role from control plane
              // Note: rolePermissions.list returns an array directly, not wrapped in an object
              const permissions =
                await controlPlaneAdapters.rolePermissions.list(
                  controlPlaneTenantId,
                  controlPlaneRoleId,
                  {},
                );

              if (permissions.length > 0) {
                // Assign permissions to the new role
                await targetAdapters.rolePermissions.assign(
                  tenant.id,
                  newRoleId,
                  permissions.map((p) => ({
                    role_id: newRoleId,
                    resource_server_identifier: p.resource_server_identifier,
                    permission_name: p.permission_name,
                  })),
                );
              }
            } catch (error) {
              console.error(
                `Failed to sync permissions for role to new tenant "${tenant.id}":`,
                error,
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `Failed to sync roles to new tenant "${tenant.id}":`,
          error,
        );
      }
    },
  };
}
