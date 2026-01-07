import {
  CreateTenantParams,
  DataAdapters,
  RolePermissionInsert,
  Tenant,
} from "@authhero/adapter-interfaces";
import {
  EntityHookContext,
  EntityHooks,
  RolePermissionHooks,
} from "../types/Hooks";
import { EntityHooksConfig } from "../types/AuthHeroConfig";

/**
 * Chains multiple entity hooks together into a single hooks object.
 *
 * For "before" hooks (beforeCreate, beforeUpdate), the result from each hook
 * is passed to the next hook in the chain, and the final result is returned.
 *
 * For "after" hooks (afterCreate, afterUpdate, beforeDelete, afterDelete),
 * all hooks are called in sequence with the same arguments.
 *
 * @param hooks - Array of hook objects to chain together
 * @returns A single hooks object that calls all provided hooks in sequence
 *
 * @example
 * ```typescript
 * const syncHooks: EntityHooks<Role, RoleInsert> = {
 *   beforeCreate: async (ctx, data) => {
 *     return { ...data, synced: true };
 *   },
 * };
 *
 * const auditHooks: EntityHooks<Role, RoleInsert> = {
 *   beforeCreate: async (ctx, data) => {
 *     console.log('Creating role:', data);
 *     return data;
 *   },
 * };
 *
 * const chained = chainEntityHooks(syncHooks, auditHooks);
 * // chained.beforeCreate will call syncHooks first, then auditHooks with the result
 * ```
 */
function chainEntityHooks<TEntity, TInsert, TUpdate = Partial<TInsert>>(
  hooks: (EntityHooks<TEntity, TInsert, TUpdate> | undefined)[] | undefined,
): EntityHooks<TEntity, TInsert, TUpdate> | undefined {
  if (!hooks) return undefined;

  const definedHooks = hooks.filter(
    (h): h is EntityHooks<TEntity, TInsert, TUpdate> => h !== undefined,
  );

  if (definedHooks.length === 0) return undefined;
  if (definedHooks.length === 1) return definedHooks[0];

  return {
    beforeCreate: chainBeforeHooks(
      definedHooks.map((h) => h.beforeCreate),
      (ctx, data) => [ctx, data],
      (args, result) => [args[0], result],
    ),
    afterCreate: chainAfterHooks(definedHooks.map((h) => h.afterCreate)),
    beforeUpdate: chainBeforeHooks(
      definedHooks.map((h) => h.beforeUpdate),
      (ctx, id, data) => [ctx, id, data],
      (args, result) => [args[0], args[1], result],
    ),
    afterUpdate: chainAfterHooks(definedHooks.map((h) => h.afterUpdate)),
    beforeDelete: chainAfterHooks(definedHooks.map((h) => h.beforeDelete)),
    afterDelete: chainAfterHooks(definedHooks.map((h) => h.afterDelete)),
  };
}

/**
 * Chains "before" hooks that return modified data.
 * Each hook receives the result from the previous hook.
 */
function chainBeforeHooks<TArgs extends unknown[], TResult>(
  hooks: (((...args: TArgs) => Promise<TResult>) | undefined)[],
  extractArgs: (...args: TArgs) => TArgs,
  updateArgs: (args: TArgs, result: TResult) => TArgs,
): ((...args: TArgs) => Promise<TResult>) | undefined {
  const definedHooks = hooks.filter(
    (h): h is (...args: TArgs) => Promise<TResult> => h !== undefined,
  );

  if (definedHooks.length === 0) return undefined;
  if (definedHooks.length === 1) return definedHooks[0];

  return async (...args: TArgs): Promise<TResult> => {
    let currentArgs = extractArgs(...args);
    let result: TResult = currentArgs[currentArgs.length - 1] as TResult;

    for (const hook of definedHooks) {
      result = await hook(...currentArgs);
      currentArgs = updateArgs(currentArgs, result);
    }

    return result;
  };
}

/**
 * Chains "after" hooks that don't return values.
 * All hooks are called in sequence with the same arguments.
 */
function chainAfterHooks<TArgs extends unknown[]>(
  hooks: (((...args: TArgs) => Promise<void>) | undefined)[],
): ((...args: TArgs) => Promise<void>) | undefined {
  const definedHooks = hooks.filter(
    (h): h is (...args: TArgs) => Promise<void> => h !== undefined,
  );

  if (definedHooks.length === 0) return undefined;
  if (definedHooks.length === 1) return definedHooks[0];

  return async (...args: TArgs): Promise<void> => {
    for (const hook of definedHooks) {
      await hook(...args);
    }
  };
}

/**
 * Chains multiple RolePermissionHooks together.
 */
function chainRolePermissionHooks(
  hooks: (RolePermissionHooks | undefined)[] | undefined,
): RolePermissionHooks | undefined {
  if (!hooks) return undefined;

  const definedHooks = hooks.filter(
    (h): h is RolePermissionHooks => h !== undefined,
  );

  if (definedHooks.length === 0) return undefined;
  if (definedHooks.length === 1) return definedHooks[0];

  return {
    beforeAssign: chainBeforeHooks(
      definedHooks.map((h) => h.beforeAssign),
      (ctx, roleId, permissions) => [ctx, roleId, permissions],
      (args, result) => [args[0], args[1], result],
    ),
    afterAssign: chainAfterHooks(definedHooks.map((h) => h.afterAssign)),
    beforeRemove: chainBeforeHooks(
      definedHooks.map((h) => h.beforeRemove),
      (ctx, roleId, permissions) => [ctx, roleId, permissions],
      (args, result) => [args[0], args[1], result],
    ),
    afterRemove: chainAfterHooks(definedHooks.map((h) => h.afterRemove)),
  };
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
function wrapEntityAdapter<
  TEntity,
  TInsert,
  TUpdate,
  TAdapter extends {
    create: (tenantId: string, data: TInsert) => Promise<TEntity>;
    update: (tenantId: string, id: string, data: TUpdate) => Promise<TEntity | boolean>;
    remove: (tenantId: string, id: string) => Promise<boolean>;
    get: (tenantId: string, id: string) => Promise<TEntity | null>;
  },
>(
  adapter: TAdapter,
  hooks: EntityHooks<TEntity, TInsert, TUpdate> | undefined,
  context: EntityHookContext,
): TAdapter {
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
 * Wraps the tenants adapter with entity hooks.
 * Tenants have a different signature than other entity adapters
 * (they don't take tenantId as first param since they ARE the top-level entities).
 */
function wrapTenantsAdapter(
  adapter: DataAdapters["tenants"],
  hooks: EntityHooks<Tenant, CreateTenantParams> | undefined,
  context: EntityHookContext,
): DataAdapters["tenants"] {
  if (!hooks) {
    return adapter;
  }

  return {
    ...adapter,

    create: async (data) => {
      let processedData = data;

      // Call beforeCreate hook
      if (hooks.beforeCreate) {
        processedData = await hooks.beforeCreate(context, data);
      }

      // Perform the actual create
      const entity = await adapter.create(processedData);

      // Call afterCreate hook
      if (hooks.afterCreate) {
        await hooks.afterCreate(context, entity);
      }

      return entity;
    },

    update: async (id, data) => {
      let processedData = data;

      // Call beforeUpdate hook
      if (hooks.beforeUpdate) {
        processedData = await hooks.beforeUpdate(context, id, data);
      }

      // Perform the actual update
      await adapter.update(id, processedData);

      // Get the updated entity for afterUpdate hook
      if (hooks.afterUpdate) {
        const entity = await adapter.get(id);
        if (entity) {
          await hooks.afterUpdate(context, id, entity);
        }
      }
    },

    remove: async (id) => {
      // Call beforeDelete hook
      if (hooks.beforeDelete) {
        await hooks.beforeDelete(context, id);
      }

      // Perform the actual delete
      const result = await adapter.remove(id);

      // Call afterDelete hook
      if (hooks.afterDelete && result) {
        await hooks.afterDelete(context, id);
      }

      return result;
    },
  };
}

/**
 * Adds entity hooks to data adapters.
 * This wraps each entity adapter's CRUD methods to call the configured hooks.
 *
 * Hooks must be provided as arrays. Multiple hooks are chained together with
 * proper return value handling for "before" hooks.
 *
 * @example Single hook
 * ```typescript
 * const wrappedData = addEntityHooks(data, {
 *   tenantId: ctx.var.tenant_id,
 *   entityHooks: {
 *     roles: [{
 *       afterCreate: async (ctx, role) => {
 *         await syncToChildTenants(ctx, role);
 *       },
 *     }],
 *   },
 * });
 * ```
 *
 * @example Chaining multiple hooks
 * ```typescript
 * const wrappedData = addEntityHooks(data, {
 *   tenantId: ctx.var.tenant_id,
 *   entityHooks: {
 *     roles: [syncHooks, auditHooks], // Called in order
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

  // Chain hook arrays into single hooks
  const hooks = {
    connections: chainEntityHooks(entityHooks.connections),
    roles: chainEntityHooks(entityHooks.roles),
    resourceServers: chainEntityHooks(entityHooks.resourceServers),
    rolePermissions: chainRolePermissionHooks(entityHooks.rolePermissions),
    tenants: chainEntityHooks(entityHooks.tenants),
  };

  // Create the hook context
  const context: EntityHookContext = {
    tenantId,
    adapters: data,
  };

  return {
    ...data,
    connections: wrapEntityAdapter(data.connections, hooks.connections, context),
    roles: wrapEntityAdapter(data.roles, hooks.roles, context),
    resourceServers: wrapEntityAdapter(data.resourceServers, hooks.resourceServers, context),
    rolePermissions: wrapRolePermissionsAdapter(data.rolePermissions, hooks.rolePermissions, context),
    tenants: wrapTenantsAdapter(data.tenants, hooks.tenants, context),
  };
}
