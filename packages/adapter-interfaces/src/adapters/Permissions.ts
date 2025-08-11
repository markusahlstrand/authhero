import { ListParams } from "../types/ListParams";
import { Permission, PermissionInsert, Totals } from "../types";

export interface ListPermissionsResponse extends Totals {
  permissions: Permission[];
}

export interface PermissionsAdapter {
  create(tenant_id: string, permission: PermissionInsert): Promise<Permission>;
  get(tenant_id: string, permission_id: string): Promise<Permission | null>;
  list(
    tenant_id: string,
    params?: ListParams,
  ): Promise<ListPermissionsResponse>;
  update(
    tenant_id: string,
    permission_id: string,
    permission: Partial<PermissionInsert>,
  ): Promise<boolean>;
  remove(tenant_id: string, permission_id: string): Promise<boolean>;
}
