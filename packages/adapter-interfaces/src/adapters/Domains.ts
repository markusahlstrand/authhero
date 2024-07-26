import { Totals, Domain } from "../types";
import { ListParams } from "../types/ListParams";

interface ListDomainsResponse extends Totals {
  domains: Domain[];
}

export interface DomainsAdapter {
  create(tenant_id: string, params: Domain): Promise<Domain>;
  list(tenant_id: string, params: ListParams): Promise<ListDomainsResponse>;
}
