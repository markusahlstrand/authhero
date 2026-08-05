import { Role } from "../types";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListUserRolesResponse {
  roles: Role[];
  start: number;
  limit: number;
  length: number;
}

export interface ListRoleUsersResponse {
  /** Distinct user ids holding the role, ordered by user_id ascending. */
  userIds: string[];
  start: number;
  limit: number;
  /**
   * Offset mode: total number of distinct users holding the role.
   * Checkpoint mode: number of ids in this page (no total is computed).
   */
  length: number;
  /** Opaque checkpoint cursor for the next page; absent on the last page. */
  next?: string;
}

export interface UserRolesAdapter {
  /**
   * List the roles assigned to a user, returned as a flat array.
   *
   * `organizationId` selects the scope and adapters MUST honor it exactly:
   *   - `undefined` — roles across every organization scope (no filter)
   *   - `""`        — global / tenant-level roles only
   *   - `"<id>"`    — that organization's roles only
   *
   * The empty-string case is load-bearing: callers pass `""` to read a user's
   * global roles (e.g. the org-membership `admin:organizations` bypass), so an
   * adapter that treats `""` as "all scopes" leaks org-scoped roles into global
   * lookups (see #1198).
   */
  list(
    tenantId: string,
    userId: string,
    params?: ListParams,
    organizationId?: string,
  ): Promise<Role[]>;
  /**
   * List the distinct users assigned to a role, across all organization
   * scopes (a user holding the role in several organizations appears once).
   * Supports offset (page/per_page) and checkpoint (from/take) pagination.
   */
  listUsers(
    tenantId: string,
    roleId: string,
    params?: ListParams,
  ): Promise<ListRoleUsersResponse>;
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
