import { CustomDomain, CustomDomainInsert } from "../types/CustomDomain";

export interface CustomDomainsAdapter {
  create: (
    tenant_id: string,
    custom_domain: CustomDomainInsert,
  ) => Promise<CustomDomain>;
  get: (tenant_id: string, id: string) => Promise<CustomDomain | null>;
  list: (tenant_id: string) => Promise<CustomDomain[]>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
  update: (
    tenant_id: string,
    id: string,
    custom_domain: Partial<CustomDomain>,
  ) => Promise<boolean>;
}
