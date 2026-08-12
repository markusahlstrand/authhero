import { ListParams } from "../types/ListParams";
import {
  RolePermissionInsert,
  RolePermissionList,
} from "../types/RolePermission";
import { CreateOptions } from "../types/ImportMetadata";

export interface RolePermissionsAdapter {
  // Assign permissions to a role
  assign(
    tenant_id: string,
    role_id: string,
    permissions: RolePermissionInsert[],
    options?: CreateOptions,
  ): Promise<boolean>;

  // Remove permissions from a role. Resolves `true` when the removal
  // succeeded, including when the permissions were already absent — callers
  // treat `false` as an adapter failure, not as "nothing matched".
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
  ): Promise<RolePermissionList>;
}
