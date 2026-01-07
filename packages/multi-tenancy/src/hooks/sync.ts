import {
  DataAdapters,
  Role,
  RoleInsert,
  ResourceServer,
  ResourceServerInsert,
  Connection,
  ConnectionInsert,
  Tenant,
} from "@authhero/adapter-interfaces";
import { TenantEntityHooks, TenantHookContext } from "../types";
import { fetchAll, EntityHooks, EntityHookContext } from "authhero";

/**
 * Fields that should be excluded from syncing connections as they contain tenant-specific secrets
 */
const CONNECTION_SENSITIVE_FIELDS = [
  "client_id",
  "client_secret",
  "app_secret",
  "kid",
  "team_id",
  "twilio_sid",
  "twilio_token",
] as const;

/**
 * Configuration for entity synchronization
 */
export interface EntitySyncConfig {
  /**
   * The control plane tenant ID from which entities are synced
   */
  controlPlaneTenantId: string;

  /**
   * Function to get the list of all tenant IDs to sync to.
   */
  getChildTenantIds: () => Promise<string[]>;

  /**
   * Function to get adapters for a specific tenant.
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /**
   * Function to get adapters for the control plane (used for tenant creation sync).
   */
  getControlPlaneAdapters: () => Promise<DataAdapters>;

  /**
   * Which entities to sync. All default to true.
   */
  sync?: {
    resourceServers?: boolean;
    roles?: boolean;
    connections?: boolean;
  };

  /**
   * Optional filters for each entity type
   */
  filters?: {
    resourceServers?: (entity: ResourceServer) => boolean;
    roles?: (entity: Role) => boolean;
    connections?: (entity: Connection) => boolean;
  };
}

/**
 * Generic entity adapter interface for sync operations
 */
interface EntitySyncAdapter<TEntity, TInsert> {
  list: (
    tenantId: string,
    params: { q?: string; per_page?: number },
  ) => Promise<TEntity[]>;
  // Raw list returning paginated response for fetchAll compatibility
  listPaginated: (
    tenantId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;
  get: (tenantId: string, id: string) => Promise<TEntity | null>;
  create: (tenantId: string, data: TInsert) => Promise<TEntity>;
  update: (
    tenantId: string,
    id: string,
    data: Partial<TInsert>,
  ) => Promise<boolean>;
  remove: (tenantId: string, id: string) => Promise<boolean>;
  listKey: string;
  getId: (entity: TEntity) => string | undefined;
  transform: (entity: TEntity) => TInsert;
  preserveOnUpdate?: (existing: TEntity, synced: TInsert) => TInsert;
}

/**
 * Creates a generic entity sync hooks factory
 */
function createEntitySyncHooks<TEntity extends { name: string }, TInsert>(
  config: EntitySyncConfig,
  adapter: (adapters: DataAdapters) => EntitySyncAdapter<TEntity, TInsert>,
  shouldSync: (entity: TEntity) => boolean = () => true,
) {
  const { controlPlaneTenantId, getChildTenantIds, getAdapters } = config;

  const pendingDeletes = new Map<string, TEntity>();

  async function findByName(
    adapters: DataAdapters,
    tenantId: string,
    name: string,
  ): Promise<TEntity | null> {
    const entityAdapter = adapter(adapters);
    const items = await entityAdapter.list(tenantId, {
      q: `name:${name}`,
      per_page: 1,
    });
    return items[0] ?? null;
  }

  async function syncToChildTenants(entity: TEntity): Promise<void> {
    const childTenantIds = await getChildTenantIds();
    const entityAdapter = adapter(await getAdapters(controlPlaneTenantId));

    await Promise.all(
      childTenantIds.map(async (tenantId) => {
        try {
          const adapters = await getAdapters(tenantId);
          const targetAdapter = adapter(adapters);
          const dataToSync = entityAdapter.transform(entity);
          const dataWithIsSystem = {
            ...dataToSync,
            is_system: true,
          } as TInsert;

          const existing = await findByName(adapters, tenantId, entity.name);
          const existingId = existing
            ? targetAdapter.getId(existing)
            : undefined;

          if (existing && existingId) {
            // Preserve sensitive fields if adapter specifies
            const finalData = targetAdapter.preserveOnUpdate
              ? targetAdapter.preserveOnUpdate(existing, dataWithIsSystem)
              : dataWithIsSystem;
            await targetAdapter.update(tenantId, existingId, finalData);
          } else {
            await targetAdapter.create(tenantId, dataWithIsSystem);
          }
        } catch (error) {
          console.error(
            `Failed to sync ${entityAdapter.listKey} "${entity.name}" to tenant "${tenantId}":`,
            error,
          );
        }
      }),
    );
  }

  async function deleteFromChildTenants(name: string): Promise<void> {
    const childTenantIds = await getChildTenantIds();

    await Promise.all(
      childTenantIds.map(async (tenantId) => {
        try {
          const adapters = await getAdapters(tenantId);
          const targetAdapter = adapter(adapters);
          const existing = await findByName(adapters, tenantId, name);
          const existingId = existing
            ? targetAdapter.getId(existing)
            : undefined;

          if (existing && existingId) {
            await targetAdapter.remove(tenantId, existingId);
          }
        } catch (error) {
          console.error(
            `Failed to delete entity "${name}" from tenant "${tenantId}":`,
            error,
          );
        }
      }),
    );
  }

  return {
    afterCreate: async (ctx: EntityHookContext, entity: TEntity) => {
      if (ctx.tenantId !== controlPlaneTenantId) return;
      if (!shouldSync(entity)) return;
      await syncToChildTenants(entity);
    },

    afterUpdate: async (
      ctx: EntityHookContext,
      _id: string,
      entity: TEntity,
    ) => {
      if (ctx.tenantId !== controlPlaneTenantId) return;
      if (!shouldSync(entity)) return;
      await syncToChildTenants(entity);
    },

    beforeDelete: async (ctx: EntityHookContext, id: string) => {
      if (ctx.tenantId !== controlPlaneTenantId) return;
      const entityAdapter = adapter(ctx.adapters);
      const entity = await entityAdapter.get(ctx.tenantId, id);
      if (entity && shouldSync(entity)) {
        pendingDeletes.set(id, entity);
      }
    },

    afterDelete: async (ctx: EntityHookContext, id: string) => {
      if (ctx.tenantId !== controlPlaneTenantId) return;
      const entity = pendingDeletes.get(id);
      if (!entity) return;
      pendingDeletes.delete(id);
      await deleteFromChildTenants(entity.name);
    },
  };
}

/**
 * Creates tenant afterCreate hooks for syncing entities to new tenants
 */
function createTenantEntitySyncHooks<TEntity extends { name: string }, TInsert>(
  config: EntitySyncConfig,
  adapter: (adapters: DataAdapters) => EntitySyncAdapter<TEntity, TInsert>,
  shouldSync: (entity: TEntity) => boolean = () => true,
): TenantEntityHooks {
  const { controlPlaneTenantId, getControlPlaneAdapters, getAdapters } = config;

  return {
    async afterCreate(_ctx: TenantHookContext, tenant: Tenant): Promise<void> {
      if (tenant.id === controlPlaneTenantId) return;

      try {
        const controlPlaneAdapters = await getControlPlaneAdapters();
        const targetAdapters = await getAdapters(tenant.id);
        const sourceAdapter = adapter(controlPlaneAdapters);
        const targetAdapter = adapter(targetAdapters);

        const allEntities = await fetchAll<TEntity>(
          (params) => sourceAdapter.listPaginated(controlPlaneTenantId, params),
          sourceAdapter.listKey,
          { cursorField: "id", pageSize: 100 },
        );

        await Promise.all(
          allEntities
            .filter((entity) => shouldSync(entity))
            .map(async (entity) => {
              try {
                const dataToSync = sourceAdapter.transform(entity);
                await targetAdapter.create(tenant.id, {
                  ...dataToSync,
                  is_system: true,
                } as TInsert);
              } catch (error) {
                console.error(
                  `Failed to sync entity to new tenant "${tenant.id}":`,
                  error,
                );
              }
            }),
        );
      } catch (error) {
        console.error(
          `Failed to sync entities to new tenant "${tenant.id}":`,
          error,
        );
      }
    },
  };
}

// Entity adapter factories
const resourceServerAdapter = (
  adapters: DataAdapters,
): EntitySyncAdapter<ResourceServer, ResourceServerInsert> => ({
  list: async (tenantId, params) => {
    const result = await adapters.resourceServers.list(tenantId, params);
    return result.resource_servers;
  },
  listPaginated: (tenantId, params) =>
    adapters.resourceServers.list(tenantId, params),
  get: (tenantId, id) => adapters.resourceServers.get(tenantId, id),
  create: (tenantId, data) => adapters.resourceServers.create(tenantId, data),
  update: (tenantId, id, data) =>
    adapters.resourceServers.update(tenantId, id, data),
  remove: (tenantId, id) => adapters.resourceServers.remove(tenantId, id),
  listKey: "resource_servers",
  getId: (entity) => entity.id,
  transform: (entity) => ({
    id: entity.id,
    name: entity.name,
    identifier: entity.identifier,
    scopes: entity.scopes,
    signing_alg: entity.signing_alg,
    token_lifetime: entity.token_lifetime,
    token_lifetime_for_web: entity.token_lifetime_for_web,
  }),
});

const roleAdapter = (
  adapters: DataAdapters,
): EntitySyncAdapter<Role, RoleInsert> => ({
  list: async (tenantId, params) => {
    const result = await adapters.roles.list(tenantId, params);
    return result.roles;
  },
  listPaginated: (tenantId, params) => adapters.roles.list(tenantId, params),
  get: (tenantId, id) => adapters.roles.get(tenantId, id),
  create: (tenantId, data) => adapters.roles.create(tenantId, data),
  update: (tenantId, id, data) => adapters.roles.update(tenantId, id, data),
  remove: (tenantId, id) => adapters.roles.remove(tenantId, id),
  listKey: "roles",
  getId: (entity) => entity.id,
  transform: (entity) => ({
    id: entity.id,
    name: entity.name,
    description: entity.description,
  }),
});

const connectionAdapter = (
  adapters: DataAdapters,
): EntitySyncAdapter<Connection, ConnectionInsert> => ({
  list: async (tenantId, params) => {
    const result = await adapters.connections.list(tenantId, params);
    return result.connections;
  },
  listPaginated: (tenantId, params) =>
    adapters.connections.list(tenantId, params),
  get: (tenantId, id) => adapters.connections.get(tenantId, id),
  create: (tenantId, data) => adapters.connections.create(tenantId, data),
  update: (tenantId, id, data) =>
    adapters.connections.update(tenantId, id, data),
  remove: (tenantId, id) => adapters.connections.remove(tenantId, id),
  listKey: "connections",
  getId: (entity) => entity.id,
  transform: (entity) => {
    // Strip sensitive fields from options
    const options = entity.options ? { ...entity.options } : {};
    for (const field of CONNECTION_SENSITIVE_FIELDS) {
      delete options[field];
    }
    return {
      id: entity.id,
      name: entity.name,
      display_name: entity.display_name,
      strategy: entity.strategy,
      options,
      response_type: entity.response_type,
      response_mode: entity.response_mode,
      is_domain_connection: entity.is_domain_connection,
      show_as_button: entity.show_as_button,
      metadata: entity.metadata,
    };
  },
  preserveOnUpdate: (existing, synced) => {
    // Preserve existing sensitive fields when updating
    const existingOptions = existing.options || {};
    return {
      ...synced,
      options: {
        ...synced.options,
        client_id: existingOptions.client_id,
        client_secret: existingOptions.client_secret,
        app_secret: existingOptions.app_secret,
        kid: existingOptions.kid,
        team_id: existingOptions.team_id,
        twilio_sid: existingOptions.twilio_sid,
        twilio_token: existingOptions.twilio_token,
      },
    };
  },
});

/**
 * Result from createSyncHooks containing all entity and tenant hooks
 */
export interface SyncHooksResult {
  entityHooks: {
    resourceServers?: EntityHooks<ResourceServer, ResourceServerInsert>;
    roles?: EntityHooks<Role, RoleInsert>;
    connections?: EntityHooks<Connection, ConnectionInsert>;
  };
  tenantHooks: TenantEntityHooks;
}

/**
 * Creates all sync hooks for resource servers, roles, and connections.
 *
 * This is the main entry point for entity synchronization. It creates hooks that:
 * - Sync changes from control plane to all child tenants (create, update, delete)
 * - Copy entities to newly created tenants
 *
 * @param config - Sync configuration
 * @returns Object with entityHooks and tenantHooks ready to use
 *
 * @example
 * ```typescript
 * const { entityHooks, tenantHooks } = createSyncHooks({
 *   controlPlaneTenantId: "main",
 *   getChildTenantIds: async () => ["tenant1", "tenant2"],
 *   getAdapters: async () => dataAdapter,
 *   getControlPlaneAdapters: async () => dataAdapter,
 *   sync: { resourceServers: true, roles: true, connections: true },
 * });
 * ```
 */
export function createSyncHooks(config: EntitySyncConfig): SyncHooksResult {
  const { sync = {}, filters = {} } = config;

  const syncResourceServers = sync.resourceServers ?? true;
  const syncRoles = sync.roles ?? true;
  const syncConnections = sync.connections ?? true;

  // Create entity hooks
  const resourceServerHooks = syncResourceServers
    ? createEntitySyncHooks<ResourceServer, ResourceServerInsert>(
        config,
        resourceServerAdapter,
        filters.resourceServers,
      )
    : undefined;

  const roleHooks = syncRoles
    ? createEntitySyncHooks<Role, RoleInsert>(
        config,
        roleAdapter,
        filters.roles,
      )
    : undefined;

  const connectionHooks = syncConnections
    ? createEntitySyncHooks<Connection, ConnectionInsert>(
        config,
        connectionAdapter,
        filters.connections,
      )
    : undefined;

  // Create tenant sync hooks
  const tenantResourceServerHooks = syncResourceServers
    ? createTenantEntitySyncHooks<ResourceServer, ResourceServerInsert>(
        config,
        resourceServerAdapter,
        filters.resourceServers,
      )
    : undefined;

  const tenantRoleHooks = syncRoles
    ? createTenantEntitySyncHooks<Role, RoleInsert>(
        config,
        roleAdapter,
        filters.roles,
      )
    : undefined;

  const tenantConnectionHooks = syncConnections
    ? createTenantEntitySyncHooks<Connection, ConnectionInsert>(
        config,
        connectionAdapter,
        filters.connections,
      )
    : undefined;

  // Also sync role permissions when syncing roles to new tenants
  const tenantRoleHooksWithPermissions = syncRoles
    ? {
        async afterCreate(
          ctx: TenantHookContext,
          tenant: Tenant,
        ): Promise<void> {
          if (tenant.id === config.controlPlaneTenantId) return;

          // First sync roles
          await tenantRoleHooks?.afterCreate?.(ctx, tenant);

          // Then sync role permissions
          try {
            const controlPlaneAdapters = await config.getControlPlaneAdapters();
            const targetAdapters = await config.getAdapters(tenant.id);

            const allRoles = await fetchAll<Role>(
              (params) =>
                controlPlaneAdapters.roles.list(
                  config.controlPlaneTenantId,
                  params,
                ),
              "roles",
              { cursorField: "id", pageSize: 100 },
            );

            // Build mapping of role names to new IDs
            const roleNameToNewId = new Map<string, string>();
            for (const role of allRoles.filter(
              (r) => filters.roles?.(r) ?? true,
            )) {
              const newRole = await findRoleByName(
                targetAdapters,
                tenant.id,
                role.name,
              );
              if (newRole) {
                roleNameToNewId.set(role.name, newRole.id);
              }
            }

            // Sync permissions for each role
            for (const role of allRoles.filter(
              (r) => filters.roles?.(r) ?? true,
            )) {
              const newRoleId = roleNameToNewId.get(role.name);
              if (!newRoleId) continue;

              try {
                const permissions =
                  await controlPlaneAdapters.rolePermissions.list(
                    config.controlPlaneTenantId,
                    role.id,
                    {},
                  );

                if (permissions.length > 0) {
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
                  `Failed to sync permissions for role "${role.name}" to tenant "${tenant.id}":`,
                  error,
                );
              }
            }
          } catch (error) {
            console.error(
              `Failed to sync role permissions to tenant "${tenant.id}":`,
              error,
            );
          }
        },
      }
    : undefined;

  // Helper to find role by name
  async function findRoleByName(
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

  // Chain tenant afterCreate hooks
  const chainedTenantHooks: TenantEntityHooks = {
    async afterCreate(ctx: TenantHookContext, tenant: Tenant): Promise<void> {
      const hooks = [
        tenantResourceServerHooks?.afterCreate,
        tenantRoleHooksWithPermissions?.afterCreate ??
          tenantRoleHooks?.afterCreate,
        tenantConnectionHooks?.afterCreate,
      ];

      const errors: Error[] = [];
      for (const hook of hooks) {
        if (hook) {
          try {
            await hook(ctx, tenant);
          } catch (e) {
            errors.push(e instanceof Error ? e : new Error(String(e)));
          }
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          errors.map((e) => e.message).join("; "),
        );
    },
  };

  return {
    entityHooks: {
      resourceServers: resourceServerHooks,
      roles: roleHooks,
      connections: connectionHooks,
    },
    tenantHooks: chainedTenantHooks,
  };
}
