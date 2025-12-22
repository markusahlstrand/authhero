import {
  DataAdapters,
  Connection,
  ConnectionInsert,
  ResourceServer,
  ResourceServerInsert,
  Role,
  RoleInsert,
  RolePermissionInsert,
} from "@authhero/adapter-interfaces";
import {
  EntityHooks,
  EntityHookContext,
  RolePermissionHooks,
} from "../types/Hooks";

/**
 * Configuration for entity hooks wrapper
 */
export interface EntityHooksConfig {
  resourceServers?: EntityHooks<ResourceServer, ResourceServerInsert>;
  roles?: EntityHooks<Role, RoleInsert>;
  rolePermissions?: RolePermissionHooks;
  connections?: EntityHooks<Connection, ConnectionInsert>;
}

/**
 * Options for the entity hooks wrapper
 */
export interface EntityHooksWrapperOptions {
  /** The tenant ID for the hook context */
  tenantId: string;
  /** Entity hooks configuration */
  entityHooks?: EntityHooksConfig;
}

/**
 * Wraps a standard CRUD adapter with entity hooks.
 * Calls before* hooks before the operation and after* hooks after.
 */
function wrapEntityAdapter<TEntity, TInsert, TUpdate = Partial<TInsert>>(
  adapter: {
    create: (tenantId: string, data: TInsert) => Promise<TEntity>;
    update: (
      tenantId: string,
      id: string,
      data: TUpdate,
    ) => Promise<TEntity | boolean>;
    remove: (tenantId: string, id: string) => Promise<boolean>;
    get: (tenantId: string, id: string) => Promise<TEntity | null>;
    list: (...args: any[]) => Promise<any>;
  },
  hooks: EntityHooks<TEntity, TInsert, TUpdate> | undefined,
  context: EntityHookContext,
): typeof adapter {
  if (!hooks) {
    return adapter;
  }

  return {
    ...adapter,

    create: async (tenantId: string, data: TInsert): Promise<TEntity> => {
      let processedData = data;

      // Call beforeCreate hook
      if (hooks.beforeCreate) {
        processedData = await hooks.beforeCreate(context, data);
      }

      // Perform the actual create
      const entity = await adapter.create(tenantId, processedData);

      // Call afterCreate hook
      if (hooks.afterCreate) {
        await hooks.afterCreate(context, entity);
      }

      return entity;
    },

    update: async (
      tenantId: string,
      id: string,
      data: TUpdate,
    ): Promise<TEntity | boolean> => {
      let processedData = data;

      // Call beforeUpdate hook
      if (hooks.beforeUpdate) {
        processedData = await hooks.beforeUpdate(context, id, data);
      }

      // Perform the actual update
      const result = await adapter.update(tenantId, id, processedData);

      // Call afterUpdate hook - need to fetch the entity if update returns boolean
      if (hooks.afterUpdate) {
        let entity: TEntity | null;
        if (typeof result === "boolean") {
          entity = await adapter.get(tenantId, id);
        } else {
          entity = result;
        }
        if (entity) {
          await hooks.afterUpdate(context, id, entity);
        }
      }

      return result;
    },

    remove: async (tenantId: string, id: string): Promise<boolean> => {
      // Call beforeDelete hook
      if (hooks.beforeDelete) {
        await hooks.beforeDelete(context, id);
      }

      // Perform the actual delete
      const result = await adapter.remove(tenantId, id);

      // Call afterDelete hook
      if (hooks.afterDelete && result) {
        await hooks.afterDelete(context, id);
      }

      return result;
    },
  };
}

/**
 * Wraps the role permissions adapter with hooks.
 */
function wrapRolePermissionsAdapter(
  adapter: DataAdapters["rolePermissions"],
  hooks: RolePermissionHooks | undefined,
  context: EntityHookContext,
): DataAdapters["rolePermissions"] {
  if (!hooks) {
    return adapter;
  }

  return {
    ...adapter,

    assign: async (
      tenantId: string,
      roleId: string,
      permissions: RolePermissionInsert[],
    ): Promise<boolean> => {
      let processedPermissions = permissions;

      // Call beforeAssign hook
      if (hooks.beforeAssign) {
        processedPermissions = await hooks.beforeAssign(
          context,
          roleId,
          permissions,
        );
      }

      // Perform the actual assign
      const result = await adapter.assign(
        tenantId,
        roleId,
        processedPermissions,
      );

      // Call afterAssign hook
      if (hooks.afterAssign && result) {
        await hooks.afterAssign(context, roleId, processedPermissions);
      }

      return result;
    },

    remove: async (
      tenantId: string,
      roleId: string,
      permissions: Pick<
        RolePermissionInsert,
        "resource_server_identifier" | "permission_name"
      >[],
    ): Promise<boolean> => {
      let processedPermissions = permissions;

      // Call beforeRemove hook
      if (hooks.beforeRemove) {
        processedPermissions = await hooks.beforeRemove(
          context,
          roleId,
          permissions,
        );
      }

      // Perform the actual remove
      const result = await adapter.remove(
        tenantId,
        roleId,
        processedPermissions,
      );

      // Call afterRemove hook
      if (hooks.afterRemove && result) {
        await hooks.afterRemove(context, roleId, processedPermissions);
      }

      return result;
    },
  };
}

/**
 * Adds entity hooks to data adapters.
 * This wraps each entity adapter's CRUD methods to call the configured hooks.
 *
 * @example
 * ```typescript
 * const wrappedData = addEntityHooks(data, {
 *   tenantId: ctx.var.tenant_id,
 *   entityHooks: {
 *     roles: {
 *       afterCreate: async (ctx, role) => {
 *         await syncToChildTenants(ctx, role);
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function addEntityHooks(
  data: DataAdapters,
  options: EntityHooksWrapperOptions,
): DataAdapters {
  const { tenantId, entityHooks } = options;

  // If no entity hooks configured, return data as-is
  if (!entityHooks) {
    return data;
  }

  // Create the hook context
  const context: EntityHookContext = {
    tenantId,
    adapters: data,
  };

  return {
    ...data,

    // Wrap connections adapter
    connections: wrapEntityAdapter(
      data.connections,
      entityHooks.connections,
      context,
    ) as DataAdapters["connections"],

    // Wrap roles adapter
    roles: wrapEntityAdapter(
      data.roles,
      entityHooks.roles,
      context,
    ) as DataAdapters["roles"],

    // Wrap resource servers adapter
    resourceServers: wrapEntityAdapter(
      data.resourceServers,
      entityHooks.resourceServers,
      context,
    ) as DataAdapters["resourceServers"],

    // Wrap role permissions adapter
    rolePermissions: wrapRolePermissionsAdapter(
      data.rolePermissions,
      entityHooks.rolePermissions,
      context,
    ),
  };
}
