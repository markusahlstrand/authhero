import {
  UserPermissionsAdapter,
  UserPermissionInsert,
  UserPermissionWithDetailsList,
  UserPermissionWithDetails,
  ListParams,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { userPermissionKeys } from "../keys";
import {
  putItem,
  deleteItem,
  queryWithPagination,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface UserPermissionItem extends DynamoDBBaseItem {
  user_id: string;
  tenant_id: string;
  organization_id?: string;
  resource_server_identifier: string;
  permission_name: string;
  description?: string;
  resource_server_name?: string;
  sources?: string; // JSON array string
}

function toUserPermission(item: UserPermissionItem): UserPermissionWithDetails {
  const { tenant_id, sources, ...rest } = stripDynamoDBFields(item);
  return removeNullProperties({
    ...rest,
    resource_server_name: item.resource_server_name || item.resource_server_identifier,
    sources: sources ? JSON.parse(sources) : undefined,
  }) as unknown as UserPermissionWithDetails;
}

export function createUserPermissionsAdapter(
  ctx: DynamoDBContext,
): UserPermissionsAdapter {
  return {
    async create(
      tenantId: string,
      userId: string,
      permission: UserPermissionInsert,
      organizationId?: string,
    ): Promise<boolean> {
      const now = new Date().toISOString();

      const item: UserPermissionItem = {
        PK: userPermissionKeys.pk(tenantId, userId, organizationId),
        SK: userPermissionKeys.sk(
          permission.resource_server_identifier,
          permission.permission_name,
        ),
        entityType: "USER_PERMISSION",
        tenant_id: tenantId,
        user_id: userId,
        organization_id: organizationId,
        resource_server_identifier: permission.resource_server_identifier,
        permission_name: permission.permission_name,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return true;
    },

    async remove(
      tenantId: string,
      userId: string,
      permission: Pick<
        UserPermissionInsert,
        "resource_server_identifier" | "permission_name"
      >,
      organizationId?: string,
    ): Promise<boolean> {
      return deleteItem(
        ctx,
        userPermissionKeys.pk(tenantId, userId, organizationId),
        userPermissionKeys.sk(
          permission.resource_server_identifier,
          permission.permission_name,
        ),
      );
    },

    async list(
      tenantId: string,
      userId: string,
      params: ListParams = {},
      organizationId?: string,
    ): Promise<UserPermissionWithDetailsList> {
      const result = await queryWithPagination<UserPermissionItem>(
        ctx,
        userPermissionKeys.pk(tenantId, userId, organizationId),
        params,
        { skPrefix: userPermissionKeys.skPrefix() },
      );

      return result.items.map(toUserPermission);
    },
  };
}
