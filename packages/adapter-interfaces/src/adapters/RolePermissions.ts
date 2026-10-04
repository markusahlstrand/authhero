import { ListParams } from "../types/ListParams";
import {
  RolePermissionInsert,
  RolePermissionList,
} from "../types/RolePermission";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListRolePermissionsCheckpointResponse {
  permissions: RolePermissionList;
  /** Opaque checkpoint cursor for the next page; absent on the last page. */
  next?: string;
}

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

  /**
   * Checkpoint (from/take) pagination over a role's permissions, ordered by
   * (resource_server_identifier, permission_name) ascending — the composite
   * key, so the order is unique without a surrogate id. Separate from `list`
   * because that returns a bare array with nowhere to carry `next`. Optional
   * so existing adapter implementations keep compiling; the management API
   * answers checkpoint requests with 501 when it is missing.
   */
  listCheckpoint?(
    tenant_id: string,
    role_id: string,
    params?: ListParams,
  ): Promise<ListRolePermissionsCheckpointResponse>;
}
