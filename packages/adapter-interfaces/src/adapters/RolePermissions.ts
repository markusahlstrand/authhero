import { ListParams } from "../types/ListParams";
import {
  RolePermissionInsert,
  RolePermissionWithDetailsList,
} from "../types/RolePermission";

export interface RolePermissionsAdapter {
  // Assign permissions to a role
  assign(
    tenant_id: string,
    role_id: string,
    permissions: RolePermissionInsert[],
  ): Promise<boolean>;

  // Remove permissions from a role
  remove(
    tenant_id: string,
    role_id: string,
    permissions: Pick<
      RolePermissionInsert,
      "resource_server_identifier" | "permission_name"
    >[],
  ): Promise<boolean>;

  // List all permissions for a role
  list(
    tenant_id: string,
    role_id: string,
    params?: ListParams,
  ): Promise<RolePermissionWithDetailsList>;
}
