import {
  UserRolesAdapter,
  Role,
  ListParams,
  roleSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { userRoleKeys, roleKeys } from "../keys";
import {
  putItem,
  deleteItem,
  queryItems,
  getItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface UserRoleItem extends DynamoDBBaseItem {
  user_id: string;
  tenant_id: string;
  organization_id?: string;
  role_id: string;
}

interface RoleItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
}

function toRole(item: RoleItem): Role {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return roleSchema.parse(removeNullProperties(rest));
}

export function createUserRolesAdapter(ctx: DynamoDBContext): UserRolesAdapter {
  return {
    async create(
      tenantId: string,
      userId: string,
      roleId: string,
      organizationId?: string,
    ): Promise<boolean> {
      const now = new Date().toISOString();

      const item: UserRoleItem = {
        PK: userRoleKeys.pk(tenantId, userId, organizationId),
        SK: userRoleKeys.sk(roleId),
        entityType: "USER_ROLE",
        tenant_id: tenantId,
        user_id: userId,
        organization_id: organizationId,
        role_id: roleId,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return true;
    },

    async remove(
      tenantId: string,
      userId: string,
      roleId: string,
      organizationId?: string,
    ): Promise<boolean> {
      return deleteItem(
        ctx,
        userRoleKeys.pk(tenantId, userId, organizationId),
        userRoleKeys.sk(roleId),
      );
    },

    async list(
      tenantId: string,
      userId: string,
      _params: ListParams = {},
      organizationId?: string,
    ): Promise<Role[]> {
      const { items } = await queryItems<UserRoleItem>(
        ctx,
        userRoleKeys.pk(tenantId, userId, organizationId),
        { skPrefix: userRoleKeys.skPrefix() },
      );

      // Fetch the actual role details
      const roles: Role[] = [];
      for (const userRole of items) {
        const roleItem = await getItem<RoleItem>(
          ctx,
          roleKeys.pk(tenantId),
          roleKeys.sk(userRole.role_id),
        );
        if (roleItem) {
          roles.push(toRole(roleItem));
        }
      }

      return roles;
    },
  };
}
