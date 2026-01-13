import { nanoid } from "nanoid";
import {
  RolesAdapter,
  Role,
  RoleInsert,
  ListRolesResponse,
  ListParams,
  roleSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { roleKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface RoleItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  is_system?: boolean;
  metadata?: Record<string, unknown>;
}

function toRole(item: RoleItem): Role {
  const { tenant_id, is_system, metadata, ...rest } = stripDynamoDBFields(item);
  return roleSchema.parse(
    removeNullProperties({
      ...rest,
      is_system: is_system ? true : undefined,
      metadata,
    }),
  );
}

export function createRolesAdapter(ctx: DynamoDBContext): RolesAdapter {
  return {
    async create(tenantId: string, role: RoleInsert): Promise<Role> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: RoleItem = {
        PK: roleKeys.pk(tenantId),
        SK: roleKeys.sk(id),
        entityType: "ROLE",
        tenant_id: tenantId,
        id,
        name: role.name,
        description: role.description,
        is_system: role.is_system ?? false,
        metadata: role.metadata,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toRole(item);
    },

    async get(tenantId: string, roleId: string): Promise<Role | null> {
      const item = await getItem<RoleItem>(
        ctx,
        roleKeys.pk(tenantId),
        roleKeys.sk(roleId),
      );

      if (!item) return null;

      return toRole(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListRolesResponse> {
      const result = await queryWithPagination<RoleItem>(
        ctx,
        roleKeys.pk(tenantId),
        params,
        { skPrefix: "ROLE#" },
      );

      return {
        roles: result.items.map(toRole),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      roleId: string,
      updates: Partial<Role>,
    ): Promise<boolean> {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Remove id from updates
      delete updateData.id;

      return updateItem(
        ctx,
        roleKeys.pk(tenantId),
        roleKeys.sk(roleId),
        updateData,
      );
    },

    async remove(tenantId: string, roleId: string): Promise<boolean> {
      return deleteItem(ctx, roleKeys.pk(tenantId), roleKeys.sk(roleId));
    },
  };
}
