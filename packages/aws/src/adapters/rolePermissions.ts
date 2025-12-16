import {
  RolePermissionsAdapter,
  RolePermissionInsert,
  RolePermissionList,
  RolePermission,
  ListParams,
  rolePermissionSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { rolePermissionKeys } from "../keys";
import {
  putItem,
  deleteItem,
  queryWithPagination,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface RolePermissionItem extends DynamoDBBaseItem {
  role_id: string;
  tenant_id: string;
  resource_server_identifier: string;
  permission_name: string;
}

function toRolePermission(item: RolePermissionItem): RolePermission {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return rolePermissionSchema.parse(removeNullProperties(rest));
}

export function createRolePermissionsAdapter(
  ctx: DynamoDBContext,
): RolePermissionsAdapter {
  return {
    async assign(
      tenantId: string,
      roleId: string,
      permissions: RolePermissionInsert[],
    ): Promise<boolean> {
      const now = new Date().toISOString();

      for (const permission of permissions) {
        const item: RolePermissionItem = {
          PK: rolePermissionKeys.pk(tenantId, roleId),
          SK: rolePermissionKeys.sk(
            permission.resource_server_identifier,
            permission.permission_name,
          ),
          entityType: "ROLE_PERMISSION",
          tenant_id: tenantId,
          role_id: permission.role_id,
          resource_server_identifier: permission.resource_server_identifier,
          permission_name: permission.permission_name,
          created_at: now,
          updated_at: now,
        };

        await putItem(ctx, item);
      }

      return true;
    },

    async remove(
      tenantId: string,
      roleId: string,
      permissions: Pick<
        RolePermissionInsert,
        "resource_server_identifier" | "permission_name"
      >[],
    ): Promise<boolean> {
      for (const permission of permissions) {
        await deleteItem(
          ctx,
          rolePermissionKeys.pk(tenantId, roleId),
          rolePermissionKeys.sk(
            permission.resource_server_identifier,
            permission.permission_name,
          ),
        );
      }

      return true;
    },

    async list(
      tenantId: string,
      roleId: string,
      _params: ListParams = {},
    ): Promise<RolePermissionList> {
      const result = await queryWithPagination<RolePermissionItem>(
        ctx,
        rolePermissionKeys.pk(tenantId, roleId),
        _params,
        { skPrefix: rolePermissionKeys.skPrefix() },
      );

      return result.items.map(toRolePermission);
    },
  };
}
