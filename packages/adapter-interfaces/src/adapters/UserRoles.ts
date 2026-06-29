import { Role } from "../types";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListUserRolesResponse {
  roles: Role[];
  start: number;
  limit: number;
  length: number;
}

export interface UserRolesAdapter {
  list(
    tenantId: string,
    userId: string,
    params?: ListParams,
    organizationId?: string,
  ): Promise<Role[]>; // return a flat list of roles
  create(
    tenantId: string,
    userId: string,
    roleId: string,
    organizationId?: string,
    options?: CreateOptions,
  ): Promise<boolean>;
  remove(
    tenantId: string,
    userId: string,
    roleId: string,
    organizationId?: string,
  ): Promise<boolean>;
}
