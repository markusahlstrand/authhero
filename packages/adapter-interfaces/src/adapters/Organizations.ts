import { Organization, OrganizationInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListOrganizationsResponse extends Totals {
  organizations: Organization[];
}

export interface OrganizationsAdapter {
  create(tenant_id: string, params: OrganizationInsert): Promise<Organization>;
  get(tenant_id: string, id: string): Promise<Organization | null>;
  remove(tenant_id: string, id: string): Promise<boolean>;
  list(
    tenant_id: string,
    params?: ListParams,
  ): Promise<ListOrganizationsResponse>;
  update(
    tenant_id: string,
    id: string,
    params: Partial<OrganizationInsert>,
  ): Promise<boolean>;
}
