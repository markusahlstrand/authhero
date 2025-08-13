import { ListParams } from "../types/ListParams";
import { UserPermissionInsert, UserPermissionWithDetailsList } from "../types";

export interface UserPermissionsAdapter {
  // Assign permissions to a user
  assign(
    tenant_id: string,
    user_id: string,
    permissions: UserPermissionInsert[],
  ): Promise<boolean>;

  // Remove permissions from a user
  remove(
    tenant_id: string,
    user_id: string,
    permissions: Pick<
      UserPermissionInsert,
      "resource_server_identifier" | "permission_name"
    >[],
  ): Promise<boolean>;

  // List all permissions for a user (including inherited from roles)
  list(
    tenant_id: string,
    user_id: string,
    params?: ListParams,
  ): Promise<UserPermissionWithDetailsList>;
}
