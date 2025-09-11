import { ListParams } from "../types/ListParams";
import { UserPermissionInsert, UserPermissionWithDetailsList } from "../types";

export interface UserPermissionsAdapter {
  // Create a single permission for a user
  create(
    tenant_id: string,
    user_id: string,
    permission: UserPermissionInsert,
    organization_id?: string,
  ): Promise<boolean>;

  // Remove a single permission from a user
  remove(
    tenant_id: string,
    user_id: string,
    permission: Pick<
      UserPermissionInsert,
      "resource_server_identifier" | "permission_name"
    >,
    organization_id?: string,
  ): Promise<boolean>;

  // List all permissions for a user (including inherited from roles)
  list(
    tenant_id: string,
    user_id: string,
    params?: ListParams,
    organization_id?: string,
  ): Promise<UserPermissionWithDetailsList>;
}
