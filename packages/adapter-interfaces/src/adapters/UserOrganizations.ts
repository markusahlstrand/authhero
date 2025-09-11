import { Totals } from "../types";
import {
  UserOrganization,
  UserOrganizationInsert,
} from "../types/UserOrganization";
import { Organization } from "../types/Organization";
import { ListParams } from "../types/ListParams";

export interface UserOrganizationsAdapter {
  // CRUD operations for UserOrganization entity management
  create(
    tenantId: string,
    params: UserOrganizationInsert,
  ): Promise<UserOrganization>;

  get(tenantId: string, id: string): Promise<UserOrganization | null>;

  remove(tenantId: string, id: string): Promise<boolean>;

  /**
   * List user-organization relationships
   * @param tenantId - The tenant ID
   * @param params - List parameters including query options:
   *   - q: "user_id:{userId}" to get organizations for a specific user
   *   - q: "organization_id:{organizationId}" to get members of a specific organization
   */
  list(
    tenantId: string,
    params?: ListParams,
  ): Promise<{ userOrganizations: UserOrganization[] } & Totals>;

  /**
   * List organizations for a specific user (Auth0 compatible API)
   * Returns full organization objects instead of user-organization relationships
   */
  listUserOrganizations(
    tenantId: string,
    userId: string,
    params?: ListParams,
  ): Promise<{ organizations: Organization[] } & Totals>;

  update(
    tenantId: string,
    id: string,
    params: Partial<UserOrganizationInsert>,
  ): Promise<boolean>;
}
