import { Role, RoleInsert } from "../types";
import { ListParams } from "../types/ListParams";
import { Totals } from "../types";

export interface ListRolesResponse {
  roles: Role[];
  totals?: Totals;
  start: number;
  limit: number;
  length: number;
}

export interface RolesAdapter {
  create(tenantId: string, role: RoleInsert): Promise<Role>;
  get(tenantId: string, roleId: string): Promise<Role | null>;
  list(tenantId: string, params?: ListParams): Promise<ListRolesResponse>;
  update(
    tenantId: string,
    roleId: string,
    updates: Partial<Role>,
  ): Promise<boolean>;
  remove(tenantId: string, roleId: string): Promise<boolean>;
}
